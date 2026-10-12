import { describe, expect, it, vi } from 'vitest';
import { MailError } from '../../integrations/mail/mailer.js';
import { MailTemplates } from '../../integrations/mail/templates/mail-templates.service.js';
import { testConfig } from '../../config/test-config.js';
import { EmailDispatcher, backoffMs } from './email-dispatcher.service.js';
import { buildTaskEmail, taskEmail } from './task-email.js';

const config = testConfig(
  { APP_BASE_URL: 'https://sdp.example.com', APP_TIMEZONE: 'Asia/Colombo' },
  { mail: { enabled: true } },
);
const templates = new MailTemplates(config as never);

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'n-1',
    taskId: 'task-1',
    recipientId: 'dev-1',
    notificationType: 'TASK_ASSIGNED',
    createdAt: new Date(),
    payload: taskEmail('TASK_PICKED', 'Rae Viewer', {
      reviewerId: 'rev-1',
      reviewerName: 'Rae Viewer',
    }),
    task: {
      developerId: 'dev-1',
      taskCode: 'ACME-07',
      title: 'ACME-CRIM-1',
      customer: { name: 'Acme' },
    },
    recipient: {
      email: 'dev@example.com',
      fullName: 'Dev One',
      status: 'ACTIVE',
      deletedAt: null,
      userRoles: [{ role: { code: 'DEVELOPER' } }],
    },
    ...overrides,
  };
}

function harness(found: ReturnType<typeof row>, send = vi.fn().mockResolvedValue(undefined)) {
  const update = vi.fn().mockResolvedValue({});
  const prisma = {
    $queryRaw: vi
      .fn()
      .mockResolvedValueOnce([{ id: 'n-1', attempts: 1 }])
      .mockResolvedValue([]),
    notification: { findUnique: vi.fn().mockResolvedValue(found), update },
  };
  const dispatcher = new EmailDispatcher(prisma as never, { send }, templates, config as never);
  return { dispatcher, update, send, prisma };
}

describe('EmailDispatcher', () => {
  it('sends a queued task email and marks it SENT', async () => {
    const { dispatcher, update, send } = harness(row());
    await dispatcher.runOnce();

    const message = send.mock.calls[0]![0] as { to: string; subject: string; text: string };
    expect(message.to).toBe('dev@example.com');
    expect(message.subject).toBe('ACME-07: picked up for review by Rae Viewer');
    expect(message.text).toContain('Reviewer Rae Viewer picked up your task ACME-07 (Acme)');
    expect(message.text).toContain('https://sdp.example.com/crp/developer/tasks/task-1');
    expect(message.text).toMatch(/When: .*\(GMT\+5:30\)/);
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ emailStatus: 'SENT', emailSent: true }),
      }),
    );
  });

  it('claims with SKIP LOCKED so two API instances never send the same row', async () => {
    const { dispatcher, prisma } = harness(row());
    await dispatcher.runOnce();
    const sql = (prisma.$queryRaw.mock.calls[0]![0] as TemplateStringsArray).join('?');
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
  });

  it('retries a retryable failure later, with growing back-off', async () => {
    const { dispatcher, update } = harness(
      row(),
      vi.fn().mockRejectedValue(new MailError('429', true)),
    );
    await dispatcher.runOnce();
    const data = (update.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data['emailStatus']).toBeUndefined();
    expect(data['emailNextAttemptAt']).toBeInstanceOf(Date);
    expect([1, 2, 3, 4, 5].map(backoffMs)).toEqual([60_000, 120_000, 240_000, 480_000, 960_000]);
  });

  it('fails a permanent error at once', async () => {
    const { dispatcher, update } = harness(
      row(),
      vi.fn().mockRejectedValue(new MailError('Brevo answered 400', false)),
    );
    await dispatcher.runOnce();
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ emailStatus: 'FAILED' }) }),
    );
  });

  it.each([
    ['an inactive recipient', { recipient: { ...row().recipient, status: 'INACTIVE' } }],
    ['an unreadable payload', { payload: { event: 'NOPE' } }],
    ['a row older than a day', { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) }],
  ])('skips %s without sending', async (_label, overrides) => {
    const { dispatcher, update, send } = harness(row(overrides));
    await dispatcher.runOnce();
    expect(send).not.toHaveBeenCalled();
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ emailStatus: 'SKIPPED' }) }),
    );
  });

  it('stays idle when email is disabled outside tests', () => {
    const idle = new EmailDispatcher(
      {} as never,
      {} as never,
      templates,
      testConfig({ NODE_ENV: 'development', EMAIL_ENABLED: 'false' }) as never,
    );
    expect(idle.active).toBe(false);
  });
});

describe('task email copy', () => {
  const context = {
    recipientName: 'Ana',
    task: { code: 'ACME-07', title: 'ACME-CRIM-1', customer: 'Acme' },
    link: 'https://sdp.example.com/x',
    when: '10 Oct 2026, 13:30 (GMT+5:30)',
  };

  it('tells admins who handed over a task and why', () => {
    const { subject, body } = buildTaskEmail(
      taskEmail('TASK_HANDED_OVER', 'Rae Viewer', { reason: 'On leave' }),
      { ...context, relation: 'admin' },
    );
    expect(subject).toBe('ACME-07: handed over by Rae Viewer');
    expect(body.details).toContainEqual(['Reason', 'On leave']);
    expect(body.details).toContainEqual(['When', context.when]);
  });

  it('tells the developer and the new reviewer about a reassignment in their own words', () => {
    const payload = taskEmail('HANDOVER_REASSIGNED', 'Ada Admin', {
      reviewerId: 'rev-2',
      reviewerName: 'Ravi',
      previousReviewerName: 'Rae Viewer',
    });
    expect(buildTaskEmail(payload, { ...context, relation: 'developer' }).subject).toBe(
      'ACME-07: Ravi is now your reviewer',
    );
    expect(buildTaskEmail(payload, { ...context, relation: 'reviewer' }).subject).toBe(
      'ACME-07: assigned to you for review',
    );
  });

  it('reports the round and the number of findings when changes are requested', () => {
    const { body } = buildTaskEmail(
      taskEmail('CHANGES_REQUESTED', 'Rae', { reviewerName: 'Rae', round: 2, findings: 3 }),
      { ...context, relation: 'developer' },
    );
    expect(body.details).toContainEqual(['Review round', '2']);
    expect(body.details).toContainEqual(['Findings', '3']);
  });
});
