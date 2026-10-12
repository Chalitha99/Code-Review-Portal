import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailError, Mailer, type MailMessage } from './mailer.js';

const TIMEOUT_MS = 15_000;

interface MailSettings {
  brevoApiUrl: string;
  brevoApiKey: string;
  fromAddress: string;
  fromName: string;
  supportEmail: string;
}

const LINE_BREAK = /[\r\n]/;

function assertOneLine(label: string, value: string | undefined): void {
  if (value !== undefined && LINE_BREAK.test(value)) {
    throw new MailError(`${label} contains a line break`, false);
  }
}

/** Brevo transactional email over its HTTPS API (no SDK). */
export class BrevoMailer extends Mailer {
  private readonly logger = new Logger(BrevoMailer.name);
  private readonly settings: MailSettings;

  constructor(
    config: ConfigService,
    private readonly fetchImpl: typeof fetch = (input, init) => fetch(input, init),
  ) {
    super();
    this.settings = config.getOrThrow<MailSettings>('mail');
  }

  async send(message: MailMessage): Promise<void> {
    assertOneLine('Subject', message.subject);
    assertOneLine('Recipient', message.to);
    assertOneLine('Recipient name', message.toName);

    const { fromAddress, fromName, supportEmail, brevoApiKey } = this.settings;
    const body = {
      sender: { email: fromAddress, name: fromName },
      to: [{ email: message.to, ...(message.toName ? { name: message.toName } : {}) }],
      subject: message.subject,
      textContent: message.text,
      ...(message.html ? { htmlContent: message.html } : {}),
      ...(supportEmail ? { replyTo: { email: supportEmail } } : {}),
      ...(message.tags?.length ? { tags: message.tags } : {}),
    };

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.settings.brevoApiUrl}/smtp/email`, {
        method: 'POST',
        headers: {
          'api-key': brevoApiKey,
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      const reason =
        error instanceof Error && error.name === 'TimeoutError' ? 'timed out' : 'network error';
      throw new MailError(`Brevo request ${reason}`, true);
    }

    if (response.ok) return;
    const detail = await this.errorDetail(response);
    const retryable = response.status === 429 || response.status >= 500;
    throw new MailError(`Brevo answered ${String(response.status)}${detail}`, retryable);
  }

  /** Warns at boot if the key is rejected; never blocks startup. */
  async verifyAccount(): Promise<void> {
    try {
      const response = await this.fetchImpl(`${this.settings.brevoApiUrl}/account`, {
        headers: { 'api-key': this.settings.brevoApiKey, accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) {
        this.logger.warn(
          `Brevo rejected the API key check (${String(response.status)}${await this.errorDetail(response)}). Emails will fail until SDP_BREVO_API_KEY is fixed.`,
        );
      }
    } catch {
      this.logger.warn('Could not reach Brevo to check the API key; will retry on first send.');
    }
  }

  // Brevo's error body carries a code and message only, never the request content.
  private async errorDetail(response: Response): Promise<string> {
    try {
      const json = (await response.json()) as { code?: unknown; message?: unknown };
      const code = typeof json.code === 'string' ? json.code : '';
      const text = typeof json.message === 'string' ? json.message.slice(0, 200) : '';
      return code || text ? ` (${[code, text].filter(Boolean).join(': ')})` : '';
    } catch {
      return '';
    }
  }
}
