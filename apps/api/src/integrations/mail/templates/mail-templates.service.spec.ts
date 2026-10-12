import { describe, expect, it } from 'vitest';
import { escapeHtml, oneLine } from './layout.js';
import { testConfig } from '../../../config/test-config.js';
import { MailTemplates } from './mail-templates.service.js';

const config = testConfig({
  APP_BASE_URL: 'https://sdp.example.com/',
  APP_TIMEZONE: 'Asia/Colombo',
  SDP_SUPPORT_EMAIL: 'support@example.com',
});
const templates = new MailTemplates(config as never);

const issuedAt = new Date('2026-10-10T08:00:00.000Z');
const expiresAt = new Date('2026-10-11T08:00:00.000Z');

describe('MailTemplates', () => {
  it('formats times in the configured zone, with the offset', () => {
    expect(templates.formatDateTime(issuedAt)).toBe('10 Oct 2026, 13:30 (GMT+5:30)');
  });

  it('builds the invite with the link in both parts, as a fragment only', () => {
    const email = templates.userInvite({ name: 'Ana', token: 'tok_-123', expiresAt, issuedAt });
    const url = 'https://sdp.example.com/set-password#token=tok_-123';
    expect(email.subject).toBe('You have been invited to the Service Delivery Portal');
    expect(email.text).toContain(url);
    expect(email.html).toContain(url);
    expect(email.text).toContain('expires in 24 hours');
    expect(email.text).toContain('11 Oct 2026, 13:30 (GMT+5:30)');
    expect(email.text).not.toMatch(/[?&]token=/);
  });

  it('derives the reset wording from the real lifetime', () => {
    const email = templates.passwordReset({
      name: 'Ana',
      token: 't',
      issuedAt,
      expiresAt: new Date(issuedAt.getTime() + 60 * 60 * 1000),
    });
    expect(email.text).toContain('expires in 1 hour');
  });

  it('escapes user-supplied text in HTML and keeps subjects on one line', () => {
    const email = templates.accessChanged({
      name: '<script>alert(1)</script>',
      at: issuedAt,
      actorName: '"><img src=x onerror=alert(1)>',
      summary: 'Role removed',
      reason: "O'Brien & co",
    });
    expect(email.html).not.toContain('<script>');
    expect(email.html).not.toContain('<img');
    expect(email.html).toContain('&lt;script&gt;');
    expect(email.html).toContain('O&#39;Brien &amp; co');
    expect(email.text).toContain('<script>alert(1)</script>');
  });

  it('flattens line breaks out of subjects', () => {
    expect(oneLine('Task\r\nBcc: x@y.z')).toBe('Task Bcc: x@y.z');
    expect(oneLine('x'.repeat(300))).toHaveLength(200);
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });

  it('leaves no unfilled placeholders', () => {
    const emails = [
      templates.userInvite({ name: 'A', token: 't', expiresAt, issuedAt }),
      templates.passwordReset({ name: 'A', token: 't', expiresAt, issuedAt }),
      templates.passwordChanged({ name: 'A', at: issuedAt, firstPassword: false }),
      templates.emailChangedNotice({
        name: 'A',
        newEmailMasked: 'b***@x.com',
        at: issuedAt,
        actorName: 'Admin',
      }),
    ];
    for (const email of emails) {
      expect(`${email.subject}${email.text}${email.html}`).not.toMatch(/\{\{|undefined|null|NaN/);
    }
  });
});
