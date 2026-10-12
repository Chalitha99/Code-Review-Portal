/**
 * Structured logging.
 *
 * The Observability principle asks that errors and important frontend events be
 * diagnosable. Routing everything through one module means we can swap in a real
 * sink (Sentry, App Insights) by editing this file alone, and that production
 * builds stay quiet by default.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogContext = Record<string, unknown>;

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const minimumLevel: LogLevel = import.meta.env.DEV ? 'debug' : 'warn';

function shouldLog(level: LogLevel): boolean {
  return LEVEL_WEIGHT[level] >= LEVEL_WEIGHT[minimumLevel];
}

function emit(level: LogLevel, message: string, context?: LogContext): void {
  if (!shouldLog(level)) return;

  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...context,
  };

  // This module is the app's single console boundary — swap the sink here to
  // route everything to a real telemetry service. `no-console` is disabled on
  // this line only: being the one place `console.log` is allowed is the whole
  // point of the module.
  // eslint-disable-next-line no-console
  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  sink(`[sdp:${level}] ${message}`, payload);
}

export const logger = {
  debug: (message: string, context?: LogContext) => emit('debug', message, context),
  info: (message: string, context?: LogContext) => emit('info', message, context),
  warn: (message: string, context?: LogContext) => emit('warn', message, context),
  error: (message: string, context?: LogContext) => emit('error', message, context),
};
