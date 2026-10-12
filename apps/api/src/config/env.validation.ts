import { z } from 'zod';
import { originOf } from './configuration.js';
import { CONFIG_DEFAULTS as D } from './defaults.js';

/**
 * Validated once at boot, via `ConfigModule.forRoot({ validate })`. A
 * missing or malformed `DATABASE_URL` fails startup immediately with a
 * readable error instead of surfacing as a connection failure the first
 * time a request needs the database.
 */
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(D.port),
    DATABASE_URL: z.url(),
    // Optional: defaults to the origin of APP_BASE_URL (configuration.ts).
    FRONTEND_ORIGIN: z.string().optional(),
    JWT_ACCESS_SECRET: z.string().min(32).optional(),
    JWT_REFRESH_SECRET: z.string().min(32).optional(),
    JWT_ISSUER: z.string().min(1).default(D.jwtIssuer),
    JWT_AUDIENCE: z.string().min(1).default(D.jwtAudience),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(D.accessTtlSeconds),
    JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(D.refreshTtlSeconds),
    JWT_REMEMBER_TTL_SECONDS: z.coerce.number().int().positive().default(D.rememberTtlSeconds),
    // Unset means "Secure in production, not in development" (auth.config.ts).
    COOKIE_SECURE: z.enum(['true', 'false']).optional(),
    // Express `trust proxy`: a hop count ("1") or a list of trusted proxy
    // addresses/subnets ("loopback, 10.0.0.0/8"). Never "true": that trusts any
    // client-supplied X-Forwarded-For and defeats per-IP rate limiting.
    TRUST_PROXY: z
      .string()
      .trim()
      .refine(
        (value) => value.toLowerCase() !== 'true',
        'Use a hop count or proxy addresses, not "true"',
      )
      .optional(),
    SWAGGER_ENABLED: z.enum(['true', 'false']).optional(),
    DIRECT_URL: z.url().optional(),
    APP_BASE_URL: z.url().optional(),
    APP_NAME: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .refine((value) => !/[\r\n]/.test(value), 'APP_NAME must be one line')
      .optional(),
    APP_TIMEZONE: z
      .string()
      .refine(isTimeZone, 'APP_TIMEZONE must be an IANA zone such as Asia/Colombo')
      .optional(),
    INVITE_TTL_HOURS: z.coerce.number().int().min(1).max(168).optional(),
    RESET_TTL_MINUTES: z.coerce.number().int().min(10).max(1440).optional(),
    EMAIL_ENABLED: z.enum(['true', 'false']).default('false'),
    SDP_BREVO_API_KEY: z.string().trim().optional(),
    SDP_EMAIL_FROM_ADDRESS: z.email().optional(),
    SDP_EMAIL_FROM_NAME: z
      .string()
      .max(100)
      .refine((value) => !/[\r\n]/.test(value), 'SDP_EMAIL_FROM_NAME must be one line')
      .optional(),
    SDP_SUPPORT_EMAIL: z.email().optional(),
    EMAIL_DISPATCH_INTERVAL_MS: z.coerce.number().int().min(1000).max(600000).optional(),
    PASSWORD_LINK_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(10).max(3600).optional(),
    BREVO_API_URL: z.url().optional(),
    DB_TRANSACTION_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).optional(),
    DB_TRANSACTION_MAX_WAIT_MS: z.coerce.number().int().min(500).max(30000).optional(),
    E2E_MAIL_OUTBOX: z.string().optional(),
    BOOTSTRAP_ADMIN_EMAIL: z.string().optional(),
    BOOTSTRAP_ADMIN_PASSWORD: z.string().optional(),
    BOOTSTRAP_ADMIN_NAME: z.string().optional(),
  })
  .superRefine((env, context) => {
    if (env.NODE_ENV === 'test') return;
    for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
      if (!env[key]) {
        context.addIssue({ code: 'custom', path: [key], message: `${key} is required` });
      }
    }
    if (env.EMAIL_ENABLED === 'true') {
      if (!env.SDP_BREVO_API_KEY) {
        context.addIssue({
          code: 'custom',
          path: ['SDP_BREVO_API_KEY'],
          message: 'SDP_BREVO_API_KEY is required when EMAIL_ENABLED=true',
        });
      }
      if (!env.SDP_EMAIL_FROM_ADDRESS) {
        context.addIssue({
          code: 'custom',
          path: ['SDP_EMAIL_FROM_ADDRESS'],
          message:
            'SDP_EMAIL_FROM_ADDRESS (a Brevo-verified sender) is required when EMAIL_ENABLED=true',
        });
      }
    }
    if (env.NODE_ENV === 'production') {
      assertProductionTransport(env, context);
      assertProductionEmail(env, context);
    }
  });

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function assertProductionEmail(
  env: {
    EMAIL_ENABLED: string;
    APP_BASE_URL?: string | undefined;
    E2E_MAIL_OUTBOX?: string | undefined;
  },
  context: z.RefinementCtx,
): void {
  if (env.EMAIL_ENABLED !== 'true') {
    context.addIssue({
      code: 'custom',
      path: ['EMAIL_ENABLED'],
      message:
        'EMAIL_ENABLED must be true in production, or invites and resets are never delivered',
    });
  }
  if (env.APP_BASE_URL !== undefined && !env.APP_BASE_URL.startsWith('https://')) {
    context.addIssue({
      code: 'custom',
      path: ['APP_BASE_URL'],
      message: 'APP_BASE_URL must be an https:// URL in production',
    });
  }
  if (env.E2E_MAIL_OUTBOX) {
    context.addIssue({
      code: 'custom',
      path: ['E2E_MAIL_OUTBOX'],
      message: 'E2E_MAIL_OUTBOX writes links to disk and is not allowed in production',
    });
  }
}

/**
 * Production must run over HTTPS end to end. The session cookies are `Secure`
 * there, so a plain-HTTP deployment would not fail loudly — browsers would just
 * never send the cookies back and every login would bounce. Fail at boot instead.
 */
function assertProductionTransport(
  env: {
    COOKIE_SECURE?: string | undefined;
    FRONTEND_ORIGIN?: string | undefined;
    APP_BASE_URL?: string | undefined;
    DATABASE_URL: string;
  },
  context: z.RefinementCtx,
): void {
  if (env.COOKIE_SECURE === 'false') {
    context.addIssue({
      code: 'custom',
      path: ['COOKIE_SECURE'],
      message: 'COOKIE_SECURE cannot be false in production; serve the app over HTTPS',
    });
  }
  const configured = env.FRONTEND_ORIGIN?.trim();
  const fromBaseUrl = env.APP_BASE_URL ? originOf(env.APP_BASE_URL) : '';
  const effective = configured === undefined || configured === '' ? fromBaseUrl : configured;
  const origins = effective
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (origins.length === 0 || origins.some((origin) => !origin.startsWith('https://'))) {
    context.addIssue({
      code: 'custom',
      path: ['FRONTEND_ORIGIN'],
      message:
        'Set APP_BASE_URL (or FRONTEND_ORIGIN) to an https:// origin in production; every FRONTEND_ORIGIN must be https://',
    });
  }
  const sslMode = new URL(env.DATABASE_URL).searchParams.get('sslmode');
  if (sslMode !== 'require' && sslMode !== 'verify-full' && sslMode !== 'verify-ca') {
    context.addIssue({
      code: 'custom',
      path: ['DATABASE_URL'],
      message: 'DATABASE_URL must use sslmode=require (or verify-full) in production',
    });
  }
}

export type Env = z.infer<typeof envSchema>;

export function validate(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration:\n${parsed.error.message}`);
  }
  return parsed.data;
}
