import { describe, expect, it } from 'vitest';
import { validate } from './env.validation.js';

const secrets = {
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

const production = {
  ...secrets,
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://app:pw@db.example.com/sdp?sslmode=require',
  FRONTEND_ORIGIN: 'https://sdp.example.com',
  EMAIL_ENABLED: 'true',
  SDP_BREVO_API_KEY: 'xkeysib-test',
  SDP_EMAIL_FROM_ADDRESS: 'noreply@example.com',
};

describe('email settings', () => {
  it('refuses production without email delivery', () => {
    expect(() => validate({ ...production, EMAIL_ENABLED: 'false' })).toThrow(/EMAIL_ENABLED/);
  });

  it('requires the Brevo key and a sender when email is enabled', () => {
    const { SDP_BREVO_API_KEY: _key, SDP_EMAIL_FROM_ADDRESS: _from, ...rest } = production;
    expect(() => validate({ ...rest, NODE_ENV: 'development' })).toThrow(
      /SDP_BREVO_API_KEY[\s\S]*SDP_EMAIL_FROM_ADDRESS|SDP_EMAIL_FROM_ADDRESS[\s\S]*SDP_BREVO_API_KEY/,
    );
  });

  it('refuses a plain-HTTP link base and the e2e mail outbox in production', () => {
    expect(() => validate({ ...production, APP_BASE_URL: 'http://sdp.example.com' })).toThrow(
      /APP_BASE_URL/,
    );
    expect(() => validate({ ...production, E2E_MAIL_OUTBOX: '/tmp/out.jsonl' })).toThrow(
      /E2E_MAIL_OUTBOX/,
    );
  });

  it('checks the time zone and link lifetimes', () => {
    expect(() => validate({ ...production, APP_TIMEZONE: 'Mars/Base' })).toThrow(/APP_TIMEZONE/);
    expect(() => validate({ ...production, INVITE_TTL_HOURS: '0' })).toThrow(/INVITE_TTL_HOURS/);
    expect(() => validate({ ...production, RESET_TTL_MINUTES: '5' })).toThrow(/RESET_TTL_MINUTES/);
    expect(() =>
      validate({ ...production, APP_TIMEZONE: 'Asia/Colombo', INVITE_TTL_HOURS: '48' }),
    ).not.toThrow();
  });

  it('refuses a multi-line sender name', () => {
    expect(() => validate({ ...production, SDP_EMAIL_FROM_NAME: 'SDP\r\nBcc: x@y.z' })).toThrow(
      /SDP_EMAIL_FROM_NAME/,
    );
  });
});

describe('environment validation', () => {
  it('accepts a production deployment served over HTTPS end to end', () => {
    expect(() => validate(production)).not.toThrow();
  });

  it('refuses Secure-less cookies in production', () => {
    expect(() => validate({ ...production, COOKIE_SECURE: 'false' })).toThrow(/COOKIE_SECURE/);
  });

  it('refuses a plain-HTTP frontend origin in production', () => {
    expect(() =>
      validate({
        ...production,
        FRONTEND_ORIGIN: 'https://sdp.example.com,http://sdp.example.com',
      }),
    ).toThrow(/FRONTEND_ORIGIN/);
  });

  it('accepts APP_BASE_URL alone as the production origin', () => {
    const { FRONTEND_ORIGIN: _origin, ...rest } = production;
    expect(() => validate({ ...rest, APP_BASE_URL: 'https://sdp.example.com' })).not.toThrow();
    expect(() => validate(rest)).toThrow(/FRONTEND_ORIGIN/);
  });

  it('refuses a database connection without TLS in production', () => {
    expect(() =>
      validate({ ...production, DATABASE_URL: 'postgresql://app:pw@db.example.com/sdp' }),
    ).toThrow(/DATABASE_URL/);
  });

  it('refuses TRUST_PROXY=true, which would trust any X-Forwarded-For', () => {
    expect(() => validate({ ...production, TRUST_PROXY: 'true' })).toThrow(/TRUST_PROXY/);
    expect(() => validate({ ...production, TRUST_PROXY: '1' })).not.toThrow();
  });

  it('keeps local development on http://localhost working', () => {
    expect(() =>
      validate({
        ...secrets,
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://localhost/sdp',
        FRONTEND_ORIGIN: 'http://localhost:5175',
      }),
    ).not.toThrow();
  });
});
