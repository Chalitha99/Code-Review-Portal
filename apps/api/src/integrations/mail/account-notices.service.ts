import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Mailer } from './mailer.js';
import { MailTemplates } from './templates/mail-templates.service.js';
import type { EmailContent } from './templates/layout.js';

const ROLE_LABELS: Record<string, string> = {
  DEVELOPER: 'Developer',
  REVIEWER: 'Reviewer',
  ADMIN: 'Admin',
  SUPER_ADMIN: 'Super Admin',
};

export function roleList(codes: readonly string[]): string {
  return codes.length === 0 ? 'none' : codes.map((code) => ROLE_LABELS[code] ?? code).join(', ');
}

function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 1)}***@${domain}`;
}

interface Recipient {
  email: string;
  fullName: string;
}

/** Security notices to the account holder, sent after the change has committed. */
@Injectable()
export class AccountNotices implements OnModuleDestroy {
  private readonly logger = new Logger(AccountNotices.name);
  private readonly pending = new Set<Promise<void>>();

  constructor(
    private readonly mailer: Mailer,
    private readonly templates: MailTemplates,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.drain();
  }

  async drain(): Promise<void> {
    while (this.pending.size > 0) await Promise.allSettled([...this.pending]);
  }

  emailChanged(previous: Recipient, newEmail: string, actorName: string): void {
    this.send(
      previous,
      this.templates.emailChangedNotice({
        name: previous.fullName,
        newEmailMasked: maskEmail(newEmail),
        at: new Date(),
        actorName,
      }),
      'account-email-changed',
    );
  }

  accessChanged(user: Recipient, actorName: string, summary: string, reason?: string | null): void {
    this.send(
      user,
      this.templates.accessChanged({
        name: user.fullName,
        at: new Date(),
        actorName,
        summary,
        reason,
      }),
      'account-access-changed',
    );
  }

  private send(to: Recipient, content: EmailContent, tag: string): void {
    const task: Promise<void> = this.mailer
      .send({ to: to.email, toName: to.fullName, ...content, tags: [tag] })
      .catch((error: unknown) => {
        this.logger.warn(
          `Could not send ${tag} notice: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      })
      .finally(() => this.pending.delete(task));
    this.pending.add(task);
  }
}
