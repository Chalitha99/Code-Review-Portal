import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import {
  ACCESS_COOKIE,
  CSRF_COOKIE,
  DEVICE_COOKIE,
  DEVICE_COOKIE_MAX_AGE_MS,
  REFRESH_COOKIE,
  ROLE_LABELS,
} from './auth.constants.js';
import { authSettings } from './auth.config.js';
import { AuthService, type AuthTokens } from './auth.service.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { Public } from './decorators/public.decorator.js';
import { LoginDto } from './dto/login.dto.js';
import type { AuthenticatedUser } from './auth.types.js';
import { PublicAuthHeadersInterceptor } from '../password-links/public-auth-headers.interceptor.js';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Login is CSRF-exempt (it mints the token), so it gets the same Origin
   * allow-list and no-store headers as the other public auth endpoints.
   */
  @Public()
  @UseInterceptors(PublicAuthHeadersInterceptor)
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const deviceToken = this.cookie(request, DEVICE_COOKIE);
    const result = await this.auth.login(dto, {
      ...this.metadata(request),
      ...(deviceToken ? { deviceToken } : {}),
    });
    this.setCookies(response, result.tokens);
    response.cookie(DEVICE_COOKIE, result.deviceToken, {
      httpOnly: true,
      secure: authSettings(this.config).secureCookies,
      sameSite: 'strict',
      path: '/api/auth/login',
      maxAge: DEVICE_COOKIE_MAX_AGE_MS,
    });
    return result.user;
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.refresh(
      this.cookie(request, REFRESH_COOKIE),
      this.metadata(request),
    );
    this.setCookies(response, result.tokens);
    return result.user;
  }

  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(this.cookie(request, REFRESH_COOKIE));
    this.clearCookies(response);
  }

  @Get('me')
  @ApiOkResponse()
  me(@CurrentUser() user: AuthenticatedUser) {
    const { sessionId: _sessionId, ...currentUser } = user;
    return {
      ...currentUser,
      roles: currentUser.roles.map((role) => ROLE_LABELS[role]),
      createdAt: currentUser.createdAt.toISOString(),
    };
  }

  private setCookies(response: Response, tokens: AuthTokens): void {
    const secure = authSettings(this.config).secureCookies;
    const common = { httpOnly: true, secure, sameSite: 'lax' as const };
    response.cookie(ACCESS_COOKIE, tokens.accessToken, {
      ...common,
      path: '/',
      maxAge: tokens.accessMaxAgeMs,
    });
    response.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      ...common,
      path: '/api/auth',
      maxAge: tokens.refreshMaxAgeMs,
    });
    response.cookie(CSRF_COOKIE, randomBytes(32).toString('base64url'), {
      httpOnly: false,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: tokens.refreshMaxAgeMs,
    });
  }

  private clearCookies(response: Response): void {
    const secure = authSettings(this.config).secureCookies;
    const common = { httpOnly: true, secure, sameSite: 'lax' as const };
    response.clearCookie(ACCESS_COOKIE, { ...common, path: '/' });
    response.clearCookie(REFRESH_COOKIE, { ...common, path: '/api/auth' });
    response.clearCookie(CSRF_COOKIE, { secure, sameSite: 'lax', path: '/' });
  }

  private cookie(request: Request, name: string): string | undefined {
    const value = (request.cookies as Record<string, unknown> | undefined)?.[name];
    return typeof value === 'string' ? value : undefined;
  }

  private metadata(request: Request) {
    const userAgent = request.get('user-agent');
    return {
      ...(userAgent ? { userAgent } : {}),
      ...(request.ip ? { ipAddress: request.ip } : {}),
    };
  }
}
