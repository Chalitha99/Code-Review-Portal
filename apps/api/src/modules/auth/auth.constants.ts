import { CONFIG_DEFAULTS } from '../../config/defaults.js';
export const ACCESS_COOKIE = 'sdp_access';
export const REFRESH_COOKIE = 'sdp_refresh';
export const CSRF_COOKIE = 'sdp_csrf';
export const DEVICE_COOKIE = 'sdp_device';
export const DEVICE_COOKIE_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;
export const CSRF_HEADER = 'x-csrf-token';

export const PUBLIC_ROUTE = Symbol('public-route');
export const REQUIRED_ROLES = Symbol('required-roles');

export const ROLE_CODES = ['DEVELOPER', 'REVIEWER', 'ADMIN', 'SUPER_ADMIN'] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

export function isRoleCode(value: string): value is RoleCode {
  return (ROLE_CODES as readonly string[]).includes(value);
}

export type RoleLabel = 'Developer' | 'Reviewer' | 'Admin' | 'Super Admin';

export const ROLE_LABELS: Record<RoleCode, RoleLabel> = {
  DEVELOPER: 'Developer',
  REVIEWER: 'Reviewer',
  ADMIN: 'Admin',
  SUPER_ADMIN: 'Super Admin',
};

export const ROLE_CODES_BY_LABEL: Record<RoleLabel, RoleCode> = {
  Developer: 'DEVELOPER',
  Reviewer: 'REVIEWER',
  Admin: 'ADMIN',
  'Super Admin': 'SUPER_ADMIN',
};

export const JWT_ISSUER_DEFAULT = CONFIG_DEFAULTS.jwtIssuer;
export const JWT_AUDIENCE_DEFAULT = CONFIG_DEFAULTS.jwtAudience;
export const ACCESS_TTL_DEFAULT = CONFIG_DEFAULTS.accessTtlSeconds;
export const REFRESH_TTL_DEFAULT = CONFIG_DEFAULTS.refreshTtlSeconds;
export const REMEMBER_TTL_DEFAULT = CONFIG_DEFAULTS.rememberTtlSeconds;
