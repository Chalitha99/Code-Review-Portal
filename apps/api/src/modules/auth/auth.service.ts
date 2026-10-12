import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { argon2id, hash, verify } from 'argon2';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiException } from '../../common/api-error.js';
import { RateLimiterService } from '../../common/rate-limiter.service.js';
import { authSecret, authSettings } from './auth.config.js';
import { ROLE_LABELS, type RoleCode } from './auth.constants.js';
import type { JwtPayload } from './auth.types.js';
import type { LoginDto } from './dto/login.dto.js';

const userWithRoles = {
  userRoles: { where: { role: { deletedAt: null } }, include: { role: true } },
} satisfies Prisma.UserInclude;

type UserWithRoles = Prisma.UserGetPayload<{ include: typeof userWithRoles }>;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  accessMaxAgeMs: number;
  refreshMaxAgeMs: number;
}

export interface RequestMetadata {
  userAgent?: string;
  ipAddress?: string;
  deviceToken?: string;
}

/** Sign-in attempts allowed per normalised email, and per client IP, per window. */
export const LOGIN_ATTEMPTS_PER_EMAIL = 5;
export const LOGIN_ATTEMPTS_PER_IP = 30;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
/** Refreshes allowed per client IP per minute (a normal tab needs a handful). */
export const REFRESHES_PER_IP = 60;
export const REFRESH_WINDOW_MS = 60 * 1000;

/**
 * An argon2id hash of a random value nobody knows, computed once. Verifying a
 * password against it for accounts that do not exist (or have no password yet)
 * makes those failures take as long as a real wrong password, so response time
 * cannot be used to discover which emails have accounts.
 */
let dummyHash: Promise<string> | undefined;
function timingDummyHash(): Promise<string> {
  dummyHash ??= hash(randomUUID(), {
    type: argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
  return dummyHash;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly limiter: RateLimiterService,
  ) {}

  async login(dto: LoginDto, metadata: RequestMetadata) {
    const email = dto.email.trim().toLowerCase();
    // Brute-force protection: per account (slows guessing one password) and per
    // client (slows spraying one password across many accounts). Counted before
    // the password is checked, so a correct guess after the limit still fails.
    const ipAllowed =
      metadata.ipAddress === undefined ||
      this.limiter.consume(
        `login-ip:${metadata.ipAddress}`,
        LOGIN_ATTEMPTS_PER_IP,
        LOGIN_WINDOW_MS,
      );
    // A browser that has signed in to this account before gets its own counter
    // (OWASP device cookies), so failures from elsewhere cannot lock it out.
    const device = this.trustedDevice(metadata.deviceToken, email);
    const accountKey = device ? `login-device:${device}` : `login-email:${email}`;
    if (
      !ipAllowed ||
      !this.limiter.consume(accountKey, LOGIN_ATTEMPTS_PER_EMAIL, LOGIN_WINDOW_MS)
    ) {
      throw new ApiException(
        'RATE_LIMITED',
        'Too many sign-in attempts. Wait a few minutes and try again.',
      );
    }

    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      include: userWithRoles,
    });
    // One message for every credential failure: distinguishing "no such
    // account" from "wrong password" would let anyone enumerate who works here.
    // An INVITED account has no password yet, so it fails here too - after the
    // same argon2 work, so the timing does not tell them apart either.
    if (!user?.passwordHash) {
      await verify(await timingDummyHash(), dto.password).catch(() => false);
      this.invalidCredentials();
    }
    const valid = await verify(user.passwordHash, dto.password);
    if (!valid) this.invalidCredentials();
    this.limiter.forget(`login-email:${email}`);
    if (device) this.limiter.forget(accountKey);
    // Only someone who proved the password learns the account is switched off.
    if (user.status !== 'ACTIVE') {
      throw new ApiException(
        'ACCOUNT_INACTIVE',
        'Authentication failed or user account not configured. Please contact your administrator.',
      );
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const tokens = await this.createSession(user.id, dto.remember ?? false, metadata);
    return { user: this.toCurrentUser(user), tokens, deviceToken: this.issueDeviceToken(email) };
  }

  private issueDeviceToken(email: string): string {
    const nonce = randomBytes(16).toString('base64url');
    return `${nonce}.${this.deviceMac(nonce, email)}`;
  }

  /** The device nonce when `token` was issued to this email, otherwise null. */
  private trustedDevice(token: string | undefined, email: string): string | null {
    if (!token || token.length > 128) return null;
    const [nonce, mac, extra] = token.split('.');
    if (!nonce || !mac || extra !== undefined) return null;
    const expected = Buffer.from(this.deviceMac(nonce, email));
    const supplied = Buffer.from(mac);
    return expected.length === supplied.length && timingSafeEqual(expected, supplied)
      ? nonce
      : null;
  }

  private deviceMac(nonce: string, email: string): string {
    const key = createHmac('sha256', authSecret(this.config, 'JWT_REFRESH_SECRET'))
      .update('sdp-login-device')
      .digest();
    return createHmac('sha256', key).update(`${nonce}:${email}`).digest('base64url');
  }

  async refresh(refreshToken: string | undefined, metadata: RequestMetadata = {}) {
    if (
      metadata.ipAddress !== undefined &&
      !this.limiter.consume(`refresh-ip:${metadata.ipAddress}`, REFRESHES_PER_IP, REFRESH_WINDOW_MS)
    ) {
      throw new ApiException('RATE_LIMITED', 'Too many requests. Try again later.');
    }
    if (!refreshToken) throw new UnauthorizedException();
    const settings = authSettings(this.config);
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: authSecret(this.config, 'JWT_REFRESH_SECRET'),
        issuer: settings.issuer,
        audience: settings.audience,
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException();
    }
    if (payload.typ !== 'refresh') throw new UnauthorizedException();

    const session = await this.prisma.refreshSession.findUnique({
      where: { id: payload.sid },
      include: { user: { include: userWithRoles } },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.user.status !== 'ACTIVE' ||
      session.user.deletedAt !== null
    ) {
      throw new UnauthorizedException();
    }
    if (!(await verify(session.tokenHash, refreshToken))) {
      await this.prisma.refreshSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException();
    }

    const refreshTtl = Math.max(1, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000));
    const tokens = await this.signTokens(session.userId, session.id, refreshTtl);
    await this.prisma.refreshSession.update({
      where: { id: session.id },
      data: { tokenHash: await this.hashToken(tokens.refreshToken), lastUsedAt: new Date() },
    });
    return { user: this.toCurrentUser(session.user), tokens };
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    try {
      const settings = authSettings(this.config);
      const payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: authSecret(this.config, 'JWT_REFRESH_SECRET'),
        issuer: settings.issuer,
        audience: settings.audience,
        algorithms: ['HS256'],
        ignoreExpiration: true,
      });
      await this.prisma.refreshSession.updateMany({
        where: { id: payload.sid, userId: payload.sub, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } catch {
      // Logout is idempotent; invalid cookies are cleared by the controller.
    }
  }

  currentUser(user: UserWithRoles) {
    return this.toCurrentUser(user);
  }

  private async createSession(userId: string, remember: boolean, metadata: RequestMetadata) {
    const settings = authSettings(this.config);
    const sessionId = randomUUID();
    const refreshTtl = remember ? settings.rememberTtl : settings.refreshTtl;
    const tokens = await this.signTokens(userId, sessionId, refreshTtl);
    await this.prisma.refreshSession.create({
      data: {
        id: sessionId,
        userId,
        tokenHash: await this.hashToken(tokens.refreshToken),
        expiresAt: new Date(Date.now() + refreshTtl * 1000),
        ...(metadata.userAgent ? { userAgent: metadata.userAgent.slice(0, 500) } : {}),
        ...(metadata.ipAddress ? { ipAddress: metadata.ipAddress.slice(0, 64) } : {}),
      },
    });
    return tokens;
  }

  private async signTokens(
    userId: string,
    sessionId: string,
    refreshTtl: number,
  ): Promise<AuthTokens> {
    const settings = authSettings(this.config);
    const common = { sub: userId, sid: sessionId, iss: settings.issuer, aud: settings.audience };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        { ...common, jti: randomUUID(), typ: 'access' satisfies JwtPayload['typ'] },
        {
          secret: authSecret(this.config, 'JWT_ACCESS_SECRET'),
          expiresIn: settings.accessTtl,
          algorithm: 'HS256',
        },
      ),
      this.jwt.signAsync(
        { ...common, jti: randomUUID(), typ: 'refresh' satisfies JwtPayload['typ'] },
        {
          secret: authSecret(this.config, 'JWT_REFRESH_SECRET'),
          expiresIn: refreshTtl,
          algorithm: 'HS256',
        },
      ),
    ]);
    return {
      accessToken,
      refreshToken,
      accessMaxAgeMs: settings.accessTtl * 1000,
      refreshMaxAgeMs: refreshTtl * 1000,
    };
  }

  private toCurrentUser(user: UserWithRoles) {
    return {
      id: user.id,
      email: user.email,
      name: user.fullName,
      roles: user.userRoles.map(({ role }) => ROLE_LABELS[role.code as RoleCode]),
      isActive: user.status === 'ACTIVE',
      createdAt: user.createdAt.toISOString(),
    };
  }

  private hashToken(token: string) {
    return hash(token, { type: argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
  }

  private invalidCredentials(): never {
    throw new ApiException('INVALID_CREDENTIALS', 'Invalid email or password.');
  }
}
