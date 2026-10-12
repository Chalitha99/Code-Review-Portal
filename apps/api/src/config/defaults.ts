/**
 * The only place a configurable default lives. Each value is overridden by the
 * environment variable named beside it (apps/api/.env); code reads the resolved
 * value from ConfigService (`configuration.ts`), never from here or process.env.
 */
export const CONFIG_DEFAULTS = {
  /** PORT */
  port: 3000,
  /** FRONTEND_ORIGIN (comma-separated) */
  frontendOrigin: 'http://localhost:5175',
  /** APP_NAME — shown in emails */
  appName: 'Service Delivery Portal',
  /** APP_TIMEZONE — IANA zone for times in emails */
  appTimezone: 'Asia/Colombo',
  /** INVITE_TTL_HOURS */
  inviteTtlHours: 24,
  /** RESET_TTL_MINUTES */
  resetTtlMinutes: 60,
  /** PASSWORD_LINK_RESEND_COOLDOWN_SECONDS */
  resendCooldownSeconds: 60,
  /** EMAIL_DISPATCH_INTERVAL_MS */
  emailDispatchIntervalMs: 30_000,
  /** DB_TRANSACTION_TIMEOUT_MS / DB_TRANSACTION_MAX_WAIT_MS — interactive transactions over a remote DB */
  transactionTimeoutMs: 15_000,
  transactionMaxWaitMs: 5_000,
  /** BREVO_API_URL */
  brevoApiUrl: 'https://api.brevo.com/v3',
  /** JWT_ISSUER / JWT_AUDIENCE */
  jwtIssuer: 'sebsa-code-review-api',
  jwtAudience: 'sebsa-code-review-web',
  /** JWT_ACCESS_TTL_SECONDS / JWT_REFRESH_TTL_SECONDS / JWT_REMEMBER_TTL_SECONDS */
  accessTtlSeconds: 15 * 60,
  refreshTtlSeconds: 7 * 24 * 60 * 60,
  rememberTtlSeconds: 30 * 24 * 60 * 60,
} as const;
