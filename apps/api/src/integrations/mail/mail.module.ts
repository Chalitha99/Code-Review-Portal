import { Global, Logger, Module, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountNotices } from './account-notices.service.js';
import { BrevoMailer } from './brevo.mailer.js';
import { DevOutboxMailer, Mailer } from './mailer.js';
import { MailTemplates } from './templates/mail-templates.service.js';

@Global()
@Module({
  providers: [
    {
      provide: Mailer,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Mailer =>
        config.getOrThrow<boolean>('mail.enabled')
          ? new BrevoMailer(config)
          : new DevOutboxMailer(config),
    },
    MailTemplates,
    AccountNotices,
  ],
  exports: [Mailer, MailTemplates, AccountNotices],
})
export class MailModule implements OnApplicationBootstrap {
  private readonly logger = new Logger('Mail');

  constructor(
    private readonly mailer: Mailer,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    const transport = this.mailer instanceof BrevoMailer ? 'brevo' : 'dev-outbox';
    const from = this.config.getOrThrow<string>('mail.fromAddress');
    const hours = this.config.getOrThrow<number>('passwordLinks.inviteTtlMs') / 3_600_000;
    const minutes = this.config.getOrThrow<number>('passwordLinks.resetTtlMs') / 60_000;
    const baseUrl = this.config.getOrThrow<string>('appBaseUrl');
    this.logger.log(
      `Email transport: ${transport}${transport === 'brevo' ? ` (from ${from})` : ''}; links ${baseUrl}; invite ${String(hours)}h, reset ${String(minutes)}min`,
    );
    if (this.mailer instanceof BrevoMailer) void this.mailer.verifyAccount();
  }
}
