import type { Request } from 'express';
import type { RoleCode } from './auth.constants.js';

export interface JwtPayload {
  sub: string;
  sid: string;
  jti: string;
  typ: 'access' | 'refresh';
  iss: string;
  aud: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  roles: RoleCode[];
  isActive: boolean;
  createdAt: Date;
  sessionId: string;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
  cookies: Record<string, string | undefined>;
}

