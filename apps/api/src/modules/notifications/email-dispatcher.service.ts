import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MailError, Mailer } from '../../integrations/mail/mailer.js';
import { MailTemplates } from '../../integrations/mail/templates/mail-templates.service.js';
import { notificationHref } from './notification-href.js';
import { buildTaskEmail, taskEmailPayloadSchema, type RecipientRelation } from './task-email.js';

const BATCH_SIZE = 20;
const MAX_ATTEMPTS = 6;
/** Older queued rows are skipped rather than sent late (e.g. after email was off for days). */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const KICK_DELAY_MS = 750;

/** Minutes to wait after the Nth failed attempt: 1, 2, 4, 8, 16. */
export function backoffMs(attempt: number): number {
  return 2 ** Math.max(0, attempt - 1) * 60_000;
}

@Injectable()
export class EmailDispatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailDispatcher.name);
  private timer: NodeJS.Timeout | undefined;
  private kickTimer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private stopped = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: Mailer,
    private readonly templates: MailTemplates,
    private readonly config: ConfigService,
  ) {}

  /**
   * Only an instance that can really deliver (or a test run) drains the queue,
   * so a teammate's API with email off never "sends" rows to its log.
   */
  get active(): boolean {
    return (
      this.config.getOrThrow<boolean>('mail.enabled') ||
      this.config.getOrThrow<string>('nodeEnv') === 'test'
    );
  }

  onModuleInit(): void {
    if (!this.active) return;
    const interval = this.config.getOrThrow<number>('mail.dispatchIntervalMs');
    this.timer = setInterval(() => void this.runOnce(), interval);
    this.timer.unref();
    this.kick();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    clearInterval(this.timer);
    clearTimeout(this.kickTimer);
    await this.running;
  }

  /** Runs shortly after the caller's transaction is expected to have committed. */
  kick(): void {
    if (!this.active || this.stopped || this.kickTimer) return;
    this.kickTimer = setTimeout(() => {
      this.kickTimer = undefined;
      void this.runOnce();
    }, KICK_DELAY_MS);
    this.kickTimer.unref();
  }

  runOnce(): Promise<void> {
    if (this.running || this.stopped) return this.running ?? Promise.resolve();
    this.running = this.drain()
      .catch((error: unknown) => {
        this.logger.warn(
          `Email dispatch failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      })
      .finally(() => {
        this.running = undefined;
      });
    return this.running;
  }

  private async drain(): Promise<void> {
    for (;;) {
      const claimed = await this.claim();
      for (const row of claimed) await this.deliver(row.id, row.attempts);
      if (claimed.length < BATCH_SIZE || this.stopped) return;
    }
  }

  /** Leases a batch for 5 minutes; SKIP LOCKED keeps several API instances from double-sending. */
  private claim(): Promise<{ id: string; attempts: number }[]> {
    return this.prisma.$queryRaw<{ id: string; attempts: number }[]>`
      UPDATE "notifications" AS n
         SET "email_next_attempt_at" = now() + interval '5 minutes',
             "email_attempts" = coalesce(n."email_attempts", 0) + 1
       WHERE n."id" IN (
         SELECT "id" FROM "notifications"
          WHERE "email_status" = 'PENDING'::"notification_email_status"
            AND coalesce("email_next_attempt_at", "created_at") <= now()
          ORDER BY "created_at"
          LIMIT ${BATCH_SIZE}
          FOR UPDATE SKIP LOCKED)
       RETURNING n."id"::text AS "id", n."email_attempts" AS "attempts"`;
  }

  private async deliver(id: string, attempts: number): Promise<void> {
    const row = await this.prisma.notification.findUnique({
      where: { id },
      include: {
        task: {
          select: {
            developerId: true,
            taskCode: true,
            title: true,
            customer: { select: { name: true } },
          },
        },
        recipient: {
          select: {
            email: true,
            fullName: true,
            status: true,
            deletedAt: true,
            userRoles: {
              where: { role: { deletedAt: null } },
              select: { role: { select: { code: true } } },
            },
          },
        },
      },
    });
    if (!row) return;

    const payload = taskEmailPayloadSchema.safeParse(row.payload);
    const recipient = row.recipient;
    if (!payload.success || row.task === null) {
      await this.finish(id, 'SKIPPED', 'Unreadable payload');
      return;
    }
    if (recipient.status !== 'ACTIVE' || recipient.deletedAt !== null) {
      await this.finish(id, 'SKIPPED', 'Recipient is not active');
      return;
    }
    if (Date.now() - row.createdAt.getTime() > MAX_AGE_MS) {
      await this.finish(id, 'SKIPPED', 'Too old to send');
      return;
    }

    const codes = recipient.userRoles.map(({ role }) => role.code);
    const context = {
      id: row.recipientId,
      isAdmin: codes.includes('ADMIN') || codes.includes('SUPER_ADMIN'),
      isReviewer: codes.includes('REVIEWER'),
    };
    const relation: RecipientRelation =
      row.task.developerId === row.recipientId
        ? 'developer'
        : payload.data.reviewerId === row.recipientId
          ? 'reviewer'
          : 'admin';
    const { subject, body } = buildTaskEmail(payload.data, {
      recipientName: recipient.fullName,
      relation,
      task: { code: row.task.taskCode, title: row.task.title, customer: row.task.customer.name },
      link: this.templates.appUrl(notificationHref(row, context)),
      when: this.templates.formatDateTime(new Date(payload.data.occurredAt)),
    });

    try {
      await this.mailer.send({
        to: recipient.email,
        toName: recipient.fullName,
        ...this.templates.render(subject, body, new Date(payload.data.occurredAt)),
        tags: ['task-event', payload.data.event.toLowerCase().replaceAll('_', '-')],
      });
      await this.finish(id, 'SENT', null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      const retryable = !(error instanceof MailError) || error.retryable;
      if (retryable && attempts < MAX_ATTEMPTS) {
        await this.prisma.notification.update({
          where: { id },
          data: {
            emailNextAttemptAt: new Date(Date.now() + backoffMs(attempts)),
            emailLastError: message.slice(0, 500),
          },
        });
      } else {
        await this.finish(id, 'FAILED', message);
      }
      this.logger.warn(
        `Email for notification ${id} failed (attempt ${String(attempts)}): ${message}`,
      );
    }
  }

  private finish(id: string, status: 'SENT' | 'FAILED' | 'SKIPPED', error: string | null) {
    const now = new Date();
    return this.prisma.notification.update({
      where: { id },
      data: {
        emailStatus: status,
        emailNextAttemptAt: null,
        emailLastError: error?.slice(0, 500) ?? null,
        ...(status === 'SENT' ? { emailSent: true, emailSentAt: now } : {}),
      },
    });
  }
}
