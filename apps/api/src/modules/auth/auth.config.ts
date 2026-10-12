import type { ConfigService } from '@nestjs/config';
import {
  ACCESS_TTL_DEFAULT,
  JWT_AUDIENCE_DEFAULT,
  JWT_ISSUER_DEFAULT,
  REFRESH_TTL_DEFAULT,
  REMEMBER_TTL_DEFAULT,
} from './auth.constants.js';

export function authSecret(config: ConfigService, key: 'JWT_ACCESS_SECRET' | 'JWT_REFRESH_SECRET'): string {
  const value = config.get<string>(key);
  if (value && value.length >= 32) return value;
  if (config.get<string>('nodeEnv') === 'test') return `${key.toLowerCase()}-test-only-secret-32-chars`;
  throw new Error(`${key} must contain at least 32 characters`);
}

export function positiveSeconds(config: ConfigService, key: string, fallback: number): number {
  const value = Number(config.get<string>(key));
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

export function authSettings(config: ConfigService) {
  return {
    issuer: config.get<string>('JWT_ISSUER') ?? JWT_ISSUER_DEFAULT,
    audience: config.get<string>('JWT_AUDIENCE') ?? JWT_AUDIENCE_DEFAULT,
    accessTtl: positiveSeconds(config, 'JWT_ACCESS_TTL_SECONDS', ACCESS_TTL_DEFAULT),
    refreshTtl: positiveSeconds(config, 'JWT_REFRESH_TTL_SECONDS', REFRESH_TTL_DEFAULT),
    rememberTtl: positiveSeconds(config, 'JWT_REMEMBER_TTL_SECONDS', REMEMBER_TTL_DEFAULT),
    secureCookies: config.get<string>('COOKIE_SECURE') === 'true' || config.get<string>('nodeEnv') === 'production',
  };
}
