import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface MailMessage {
  to: string;
  toName?: string;
  subject: string;
  text: string;
  html?: string;
  tags?: string[];
}

/** `retryable` failures (429, 5xx, network, timeout) may be tried again; others will fail the same way. */
export class MailError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'MailError';
  }
}

/**
 * The email port. `send` rejects when the message was not handed to a
 * transport; callers record that as FAILED so it is visible and can be resent.
 */
export abstract class Mailer {
  abstract send(message: MailMessage): Promise<void>;
}

/**
 * Used when EMAIL_ENABLED is not true. Logs in development and writes
 * `E2E_MAIL_OUTBOX` in tests; anywhere else it refuses, because a one-time link
 * is a credential and must not end up in production logs.
 */
@Injectable()
export class DevOutboxMailer extends Mailer {
  private readonly logger = new Logger('DevOutbox');

  constructor(private readonly config: ConfigService) {
    super();
  }

  send(message: MailMessage): Promise<void> {
    const env = this.config.getOrThrow<string>('nodeEnv');
    if (env !== 'development' && env !== 'test') {
      this.logger.warn(`No email transport is configured; "${message.subject}" was not sent.`);
      return Promise.reject(new MailError('No email transport configured', false));
    }
    if (env === 'development') {
      this.logger.log(`[dev outbox] ${message.subject} -> ${message.to}\n${message.text}`);
    }
    const outbox = this.config.get<string>('mail.e2eOutboxFile');
    if (outbox) return this.appendToOutbox(outbox, message);
    return Promise.resolve();
  }

  private async appendToOutbox(file: string, message: MailMessage): Promise<void> {
    await mkdir(path.dirname(file), { recursive: true });
    await appendFile(file, `${JSON.stringify({ ...message, at: new Date().toISOString() })}\n`);
  }
}
