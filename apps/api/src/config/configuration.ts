import { CONFIG_DEFAULTS as D } from './defaults.js';

/**
 * Shape returned by `ConfigService.get()`: every setting, resolved once from
 * the environment and `defaults.ts`. `env.validation.ts` has already checked
 * the values, so nothing here re-validates. Code reads settings from here only.
 */
function trustProxy(raw: string | undefined): number | string | false {
  const value = raw?.trim() ?? '';
  if (value === '' || value.toLowerCase() === 'false') return false;
  return /^\d+$/.test(value) ? Number.parseInt(value, 10) : value;
}

function nonEmpty(value: string | undefined): string | undefined {
  return value?.trim() ? value.trim() : undefined;
}

function integer(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
}

const withoutTrailingSlash = (url: string) => url.replace(/\/+$/, '');

/** `https://host[:port]` of a URL, or the URL itself when it cannot be parsed. */
export function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return withoutTrailingSlash(url);
  }
}

export function loadConfiguration(env: NodeJS.ProcessEnv = process.env) {
  const nodeEnv = env['NODE_ENV'] ?? 'development';
  // The web app's origin comes from APP_BASE_URL; FRONTEND_ORIGIN is only needed
  // to allow more than one origin (or a different one) for CORS.
  const configuredBaseUrl = nonEmpty(env['APP_BASE_URL']);
  const frontendOrigins = (
    nonEmpty(env['FRONTEND_ORIGIN']) ??
    (configuredBaseUrl ? originOf(configuredBaseUrl) : D.frontendOrigin)
  )
    .split(',')
    .map((origin) => withoutTrailingSlash(origin.trim()))
    .filter(Boolean);
  const appName = nonEmpty(env['APP_NAME']) ?? D.appName;
  const fromAddress = nonEmpty(env['SDP_EMAIL_FROM_ADDRESS']) ?? '';

  return {
    nodeEnv,
    port: integer(env['PORT'], D.port),
    databaseUrl: env['DATABASE_URL'],
    database: {
      transactionOptions: {
        timeout: integer(env['DB_TRANSACTION_TIMEOUT_MS'], D.transactionTimeoutMs),
        maxWait: integer(env['DB_TRANSACTION_MAX_WAIT_MS'], D.transactionMaxWaitMs),
      },
    },
    frontendOrigins,
    /** Base of every link in an email: APP_BASE_URL, else the first frontend origin. */
    appBaseUrl: withoutTrailingSlash(configuredBaseUrl ?? frontendOrigins[0] ?? D.frontendOrigin),
    appName,
    appTimezone: nonEmpty(env['APP_TIMEZONE']) ?? D.appTimezone,
    trustProxy: trustProxy(env['TRUST_PROXY']),
    passwordLinks: {
      inviteTtlMs: integer(env['INVITE_TTL_HOURS'], D.inviteTtlHours) * 60 * 60 * 1000,
      resetTtlMs: integer(env['RESET_TTL_MINUTES'], D.resetTtlMinutes) * 60 * 1000,
      resendCooldownMs:
        integer(env['PASSWORD_LINK_RESEND_COOLDOWN_SECONDS'], D.resendCooldownSeconds) * 1000,
    },
    mail: {
      // Tests never reach a real provider, whatever apps/api/.env says.
      enabled: env['EMAIL_ENABLED'] === 'true' && nodeEnv !== 'test',
      brevoApiUrl: withoutTrailingSlash(nonEmpty(env['BREVO_API_URL']) ?? D.brevoApiUrl),
      brevoApiKey: env['SDP_BREVO_API_KEY'] ?? '',
      fromAddress,
      fromName: nonEmpty(env['SDP_EMAIL_FROM_NAME']) ?? appName,
      supportEmail: nonEmpty(env['SDP_SUPPORT_EMAIL']) ?? fromAddress,
      dispatchIntervalMs: integer(env['EMAIL_DISPATCH_INTERVAL_MS'], D.emailDispatchIntervalMs),
      /** Test runs only: each email is appended here as one JSON line. */
      e2eOutboxFile: nonEmpty(env['E2E_MAIL_OUTBOX']),
    },
    swaggerEnabled:
      env['SWAGGER_ENABLED'] === undefined
        ? nodeEnv === 'development'
        : env['SWAGGER_ENABLED'] === 'true',
  };
}

export type AppConfig = ReturnType<typeof loadConfiguration>;

export default () => loadConfiguration();
