import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { renderEmail, type EmailBody, type EmailContent } from './layout.js';

function durationText(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes % 60 !== 0) return `${String(minutes)} minutes`;
  const hours = minutes / 60;
  return hours === 1 ? '1 hour' : `${String(hours)} hours`;
}

@Injectable()
export class MailTemplates {
  constructor(private readonly config: ConfigService) {}

  get timeZone(): string {
    return this.config.getOrThrow<string>('appTimezone');
  }

  get appName(): string {
    return this.config.getOrThrow<string>('appName');
  }

  /** e.g. "10 Oct 2026, 14:35 (GMT+5:30)" in APP_TIMEZONE. */
  formatDateTime(date: Date): string {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: this.timeZone,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZoneName: 'shortOffset',
    }).formatToParts(date);
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? '';
    return `${get('day')} ${get('month')} ${get('year')}, ${get('hour')}:${get('minute')} (${get('timeZoneName')})`;
  }

  appUrl(path: string): string {
    const base = this.config.getOrThrow<string>('appBaseUrl');
    return `${base}${path.startsWith('/') ? path : `/${path}`}`;
  }

  setPasswordUrl(token: string): string {
    return this.appUrl(`/set-password#token=${encodeURIComponent(token)}`);
  }

  render(subject: string, body: EmailBody, sentAt: Date = new Date()): EmailContent {
    return renderEmail(subject, body, {
      appName: this.appName,
      supportEmail: this.config.getOrThrow<string>('mail.supportEmail'),
      sentAt: this.formatDateTime(sentAt),
    });
  }

  userInvite(input: {
    name: string;
    token: string;
    expiresAt: Date;
    issuedAt: Date;
  }): EmailContent {
    const lifetime = durationText(input.expiresAt.getTime() - input.issuedAt.getTime());
    return this.render(
      `You have been invited to the ${this.appName}`,
      {
        heading: 'Set up your account',
        greeting: `Hello ${input.name},`,
        paragraphs: [
          `An administrator has created your ${this.appName} account. Choose a password to activate it.`,
        ],
        action: { label: 'Create your password', url: this.setPasswordUrl(input.token) },
        details: [['Link expires', this.formatDateTime(input.expiresAt)]],
        notes: [
          `The link works once and expires in ${lifetime}. If it has expired, open it anyway and ask for a new one.`,
          'If you were not expecting this invitation, you can ignore this email.',
        ],
      },
      input.issuedAt,
    );
  }

  passwordReset(input: {
    name: string;
    token: string;
    expiresAt: Date;
    issuedAt: Date;
  }): EmailContent {
    const lifetime = durationText(input.expiresAt.getTime() - input.issuedAt.getTime());
    return this.render(
      `Reset your ${this.appName} password`,
      {
        heading: 'Reset your password',
        greeting: `Hello ${input.name},`,
        paragraphs: ['We received a request to reset the password for your account.'],
        action: { label: 'Choose a new password', url: this.setPasswordUrl(input.token) },
        details: [['Link expires', this.formatDateTime(input.expiresAt)]],
        notes: [
          `The link works once and expires in ${lifetime}.`,
          'If you did not ask for this, ignore this email — your password stays the same.',
        ],
      },
      input.issuedAt,
    );
  }

  passwordChanged(input: { name: string; at: Date; firstPassword: boolean }): EmailContent {
    return this.render(
      input.firstPassword ? 'Your account is ready' : 'Your password was changed',
      {
        heading: input.firstPassword ? 'Your account is ready' : 'Your password was changed',
        greeting: `Hello ${input.name},`,
        paragraphs: [
          input.firstPassword
            ? `Your password was set and your ${this.appName} account is now active.`
            : `The password for your ${this.appName} account was changed, and every signed-in session was signed out.`,
        ],
        details: [['When', this.formatDateTime(input.at)]],
        action: { label: 'Sign in', url: this.appUrl('/login') },
        notes: ['If this was not you, contact your administrator or support straight away.'],
      },
      input.at,
    );
  }

  emailChangedNotice(input: {
    name: string;
    newEmailMasked: string;
    at: Date;
    actorName: string;
  }): EmailContent {
    return this.render(
      'The email address on your account was changed',
      {
        heading: 'Your sign-in email was changed',
        greeting: `Hello ${input.name},`,
        paragraphs: [
          `${input.actorName} changed the email address for your ${this.appName} account. This address will no longer receive account emails.`,
        ],
        details: [
          ['New address', input.newEmailMasked],
          ['When', this.formatDateTime(input.at)],
        ],
        notes: ['If you did not expect this change, contact your administrator straight away.'],
      },
      input.at,
    );
  }

  accessChanged(input: {
    name: string;
    at: Date;
    actorName: string;
    summary: string;
    reason?: string | null | undefined;
  }): EmailContent {
    const details: (readonly [string, string])[] = [
      ['Change', input.summary],
      ['Changed by', input.actorName],
      ['When', this.formatDateTime(input.at)],
    ];
    if (input.reason) details.push(['Reason', input.reason]);
    return this.render(
      'Your access to the Service Delivery Portal changed',
      {
        heading: 'Your access changed',
        greeting: `Hello ${input.name},`,
        paragraphs: ['An administrator changed your account access.'],
        details,
        notes: ['If you think this is a mistake, contact your administrator.'],
      },
      input.at,
    );
  }
}
