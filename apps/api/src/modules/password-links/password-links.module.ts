import { Module } from '@nestjs/common';
import { RateLimiterService } from '../../common/rate-limiter.service.js';
import {
  InviteActionsController,
  PublicPasswordLinksController,
} from './password-links.controller.js';
import { PasswordLinksService } from './password-links.service.js';

/**
 * Temporary local sign-in (until SSO): invite, set password, forgot password.
 * `Mailer` comes from the global `MailModule`, `AuditService` from the global
 * `AuditModule`.
 */
@Module({
  controllers: [PublicPasswordLinksController, InviteActionsController],
  providers: [PasswordLinksService, RateLimiterService],
  exports: [PasswordLinksService],
})
export class PasswordLinksModule {}
