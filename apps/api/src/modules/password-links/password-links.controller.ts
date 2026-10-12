import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import { ApiAcceptedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import {
  ForgotPasswordDto,
  ResendLinkDto,
  SetPasswordDto,
  ValidateTokenDto,
} from './dto/password-link.dto.js';
import { PasswordLinksService } from './password-links.service.js';
import { PublicAuthHeadersInterceptor } from './public-auth-headers.interceptor.js';

/**
 * The four public endpoints behind the temporary local sign-in. No caller
 * identity is read: they are reached before anyone is signed in, and the token
 * is the only credential. CSRF is not applicable (no cookies are sent or
 * trusted); `PublicAuthHeadersInterceptor` checks Origin and sets no-store /
 * no-referrer instead.
 */
@ApiTags('Authentication')
@Controller('auth')
@Public()
@UseInterceptors(PublicAuthHeadersInterceptor)
export class PublicPasswordLinksController {
  constructor(private readonly links: PasswordLinksService) {}

  /** Link lifetimes and resend cooldown, so the screens never hard-code them. */
  @Get('link-policy')
  @ApiOkResponse()
  linkPolicy() {
    return this.links.linkPolicy();
  }

  /** Never consumes the token. */
  @Post('token/validate')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse()
  validate(@Body() dto: ValidateTokenDto, @Req() request: Request) {
    return this.links.validate(dto.token, request.ip);
  }

  @Post('set-password')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse()
  async setPassword(@Body() dto: SetPasswordDto, @Req() request: Request) {
    await this.links.setPassword(dto.token, dto.newPassword, request.ip);
    return { ok: true as const };
  }

  /** Always 202, whether or not the email has an account. */
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiAcceptedResponse()
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() request: Request) {
    await this.links.forgotPassword(dto.email, request.ip);
  }

  /** Always 202, whether or not the token was ever issued. */
  @Post('resend-link')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiAcceptedResponse()
  async resendLink(@Body() dto: ResendLinkDto, @Req() request: Request) {
    await this.links.resendLink(dto.token, request.ip);
  }
}

/** Users-tab invite actions. Same authorisation as editing the user. */
@ApiTags('Users')
@Controller('users/:userId')
@Roles('ADMIN', 'SUPER_ADMIN')
export class InviteActionsController {
  constructor(private readonly links: PasswordLinksService) {}

  @Post('resend-invite')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse()
  resendInvite(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.links.resendInvite(userId, actor);
  }

  @Post('reset-password-link')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse()
  sendResetLink(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.links.sendResetLink(userId, actor);
  }

  @Post('revoke-invite')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async revokeInvite(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    await this.links.revokeInvite(userId, actor);
  }
}
