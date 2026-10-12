import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { PrismaService } from '../../../prisma/prisma.service.js';
import {
  ACCESS_COOKIE,
  JWT_AUDIENCE_DEFAULT,
  JWT_ISSUER_DEFAULT,
  type RoleCode,
} from '../auth.constants.js';
import { authSecret } from '../auth.config.js';
import type { AuthenticatedUser, JwtPayload } from '../auth.types.js';

function accessCookie(request: Request): string | null {
  const cookies = request.cookies as Record<string, unknown> | undefined;
  const token = cookies?.[ACCESS_COOKIE];
  return typeof token === 'string' ? token : null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secret = authSecret(config, 'JWT_ACCESS_SECRET');
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([accessCookie]),
      ignoreExpiration: false,
      secretOrKey: secret,
      issuer: config.get<string>('JWT_ISSUER') ?? JWT_ISSUER_DEFAULT,
      audience: config.get<string>('JWT_AUDIENCE') ?? JWT_AUDIENCE_DEFAULT,
      algorithms: ['HS256'],
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (payload.typ !== 'access') throw new UnauthorizedException();
    // The access token is only as good as the session it was issued for. When
    // logout, a password change, deactivation or an email change revokes the
    // session, the 15-minute access token stops working at once too.
    const session = await this.prisma.refreshSession.findFirst({
      where: {
        id: payload.sid,
        userId: payload.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: { deletedAt: null },
      },
      select: {
        user: {
          include: {
            userRoles: { where: { role: { deletedAt: null } }, include: { role: true } },
          },
        },
      },
    });
    const user = session?.user;
    if (user?.status !== 'ACTIVE') throw new UnauthorizedException();
    return {
      id: user.id,
      email: user.email,
      name: user.fullName,
      roles: user.userRoles.map(({ role }) => role.code as RoleCode),
      isActive: true,
      createdAt: user.createdAt,
      sessionId: payload.sid,
    };
  }
}
