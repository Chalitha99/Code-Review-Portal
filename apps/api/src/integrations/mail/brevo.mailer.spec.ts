import { describe, expect, it, vi } from 'vitest';
import { BrevoMailer } from './brevo.mailer.js';
import { MailError } from './mailer.js';

const settings = {
  brevoApiUrl: 'https://brevo.test/v3',
  brevoApiKey: 'xkeysib-secret',
  fromAddress: 'noreply@example.com',
  fromName: 'Service Delivery Portal',
  supportEmail: 'support@example.com',
};
const config = { getOrThrow: () => settings };

function mailerWith(response: Response | Error) {
  const fetchImpl = vi.fn(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
  return { mailer: new BrevoMailer(config as never, fetchImpl), fetchImpl };
}

const message = {
  to: 'dev@example.com',
  toName: 'Dev One',
  subject: 'Hello',
  text: 'plain',
  html: '<p>html</p>',
  tags: ['user-invite'],
};

describe('BrevoMailer', () => {
  it('posts the message to the transactional endpoint with the API key header', async () => {
    const { mailer, fetchImpl } = mailerWith(new Response('{"messageId":"1"}', { status: 201 }));
    await mailer.send(message);

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${settings.brevoApiUrl}/smtp/email`);
    expect((init.headers as Record<string, string>)['api-key']).toBe('xkeysib-secret');
    expect(JSON.parse(init.body as string)).toEqual({
      sender: { email: 'noreply@example.com', name: 'Service Delivery Portal' },
      to: [{ email: 'dev@example.com', name: 'Dev One' }],
      subject: 'Hello',
      textContent: 'plain',
      htmlContent: '<p>html</p>',
      replyTo: { email: 'support@example.com' },
      tags: ['user-invite'],
    });
  });

  it.each([429, 500, 503])('treats %s as retryable', async (status) => {
    const { mailer } = mailerWith(new Response('{}', { status }));
    await expect(mailer.send(message)).rejects.toMatchObject({ retryable: true });
  });

  it('treats a rejected request as permanent and keeps Brevo’s reason', async () => {
    const body = JSON.stringify({ code: 'invalid_parameter', message: 'sender not verified' });
    const { mailer } = mailerWith(new Response(body, { status: 400 }));
    const error = await mailer.send(message).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(MailError);
    expect(error).toMatchObject({ retryable: false });
    expect((error as Error).message).toContain('sender not verified');
    expect((error as Error).message).not.toContain('xkeysib');
  });

  it('treats a network failure or timeout as retryable', async () => {
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    await expect(mailerWith(timeout).mailer.send(message)).rejects.toMatchObject({
      retryable: true,
      message: 'Brevo request timed out',
    });
    await expect(
      mailerWith(new TypeError('fetch failed')).mailer.send(message),
    ).rejects.toMatchObject({ retryable: true });
  });

  it.each([
    ['subject', { subject: 'Hi\r\nBcc: victim@example.com' }],
    ['recipient', { to: 'a@example.com\nBcc: b@example.com' }],
    ['recipient name', { toName: 'Eve\r\nX-Injected: 1' }],
  ])('refuses a line break in the %s, before calling Brevo', async (_label, patch) => {
    const { mailer, fetchImpl } = mailerWith(new Response('{}', { status: 201 }));
    await expect(mailer.send({ ...message, ...patch })).rejects.toMatchObject({ retryable: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
