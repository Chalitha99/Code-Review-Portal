# apps/api/src/integrations

Clients for external services the API talks to - anything outside this
process's own database and HTTP surface (identity provider, object storage,
email, etc.). Feature modules depend on the port, never on the provider.

- `mail/` - the `Mailer` port, `BrevoMailer` (HTTPS API, used when
  `EMAIL_ENABLED=true`), `DevOutboxMailer` (log / `E2E_MAIL_OUTBOX`),
  `MailTemplates` and `AccountNotices`. See `docs/email-notifications.md`.
