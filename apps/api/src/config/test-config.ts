import { loadConfiguration, type AppConfig } from './configuration.js';

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

function merge(base: Record<string, unknown>, patch: Record<string, unknown>) {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const current = result[key];
    result[key] =
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof current === 'object'
        ? merge(current as Record<string, unknown>, value as Record<string, unknown>)
        : value;
  }
  return result;
}

/** A ConfigService stand-in for specs, built from the real loader and defaults. */
export function testConfig(env: NodeJS.ProcessEnv = {}, patch: DeepPartial<AppConfig> = {}) {
  const values = merge(loadConfiguration({ NODE_ENV: 'test', ...env }), patch);
  const lookup = (key: string): unknown =>
    key
      .split('.')
      .reduce<unknown>(
        (node, part) => (node as Record<string, unknown> | undefined)?.[part],
        values,
      );
  return {
    get: <T>(key: string, fallback?: T): T => (lookup(key) ?? fallback) as T,
    getOrThrow: <T>(key: string): T => {
      const value = lookup(key);
      if (value === undefined) throw new Error(`Missing config ${key}`);
      return value as T;
    },
  };
}
