import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadConfiguration } from './configuration.js';
import { CONFIG_DEFAULTS } from './defaults.js';

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configDir = path.join(srcDir, 'config');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return full === configDir ? [] : sourceFiles(full);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [full] : [];
  });
}

describe('configuration', () => {
  it('falls back to the defaults file only', () => {
    const config = loadConfiguration({});
    expect(config.port).toBe(CONFIG_DEFAULTS.port);
    expect(config.frontendOrigins).toEqual([CONFIG_DEFAULTS.frontendOrigin]);
    expect(config.appBaseUrl).toBe(CONFIG_DEFAULTS.frontendOrigin);
    expect(config.appName).toBe(CONFIG_DEFAULTS.appName);
    expect(config.appTimezone).toBe(CONFIG_DEFAULTS.appTimezone);
    expect(config.passwordLinks.inviteTtlMs).toBe(CONFIG_DEFAULTS.inviteTtlHours * 3_600_000);
    expect(config.mail.brevoApiUrl).toBe(CONFIG_DEFAULTS.brevoApiUrl);
    expect(config.mail.fromName).toBe(CONFIG_DEFAULTS.appName);
    expect(config.database.transactionOptions).toEqual({
      timeout: CONFIG_DEFAULTS.transactionTimeoutMs,
      maxWait: CONFIG_DEFAULTS.transactionMaxWaitMs,
    });
  });

  it('takes every value from the environment when set', () => {
    const config = loadConfiguration({
      FRONTEND_ORIGIN: 'https://a.example.com/, https://b.example.com',
      APP_BASE_URL: 'https://portal.example.com/',
      APP_NAME: 'Portal',
      INVITE_TTL_HOURS: '48',
      SDP_EMAIL_FROM_ADDRESS: 'noreply@example.com',
      DB_TRANSACTION_TIMEOUT_MS: '20000',
      DB_TRANSACTION_MAX_WAIT_MS: '8000',
    });
    expect(config.database.transactionOptions).toEqual({ timeout: 20000, maxWait: 8000 });
    expect(config.frontendOrigins).toEqual(['https://a.example.com', 'https://b.example.com']);
    expect(config.appBaseUrl).toBe('https://portal.example.com');
    expect(config.appName).toBe('Portal');
    expect(config.mail.fromName).toBe('Portal');
    expect(config.mail.supportEmail).toBe('noreply@example.com');
    expect(config.passwordLinks.inviteTtlMs).toBe(48 * 3_600_000);
  });

  it('derives the allowed origin from APP_BASE_URL when FRONTEND_ORIGIN is not set', () => {
    const config = loadConfiguration({ APP_BASE_URL: 'https://portal.example.com/' });
    expect(config.frontendOrigins).toEqual(['https://portal.example.com']);
    expect(config.appBaseUrl).toBe('https://portal.example.com');
    expect(
      loadConfiguration({ APP_BASE_URL: 'http://localhost:5175/sdp' }).frontendOrigins,
    ).toEqual(['http://localhost:5175']);
  });

  it('links to the first frontend origin when APP_BASE_URL is not set', () => {
    expect(loadConfiguration({ FRONTEND_ORIGIN: 'https://x.example.com' }).appBaseUrl).toBe(
      'https://x.example.com',
    );
  });
});

describe('configuration guard', () => {
  it('reads the environment and hard-codes URLs only under src/config', () => {
    const offenders = sourceFiles(srcDir).flatMap((file) => {
      const code = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      const problems: string[] = [];
      if (/process\.env\b/.test(code)) problems.push('reads process.env');
      if (/['"`]https?:\/\//.test(code)) problems.push('hard-codes a URL');
      return problems.map((problem) => `${path.relative(srcDir, file)} ${problem}`);
    });
    expect(offenders).toEqual([]);
  });
});
