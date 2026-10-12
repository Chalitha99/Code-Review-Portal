import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { routePaths } from '@/constants/routePaths';
import { z } from 'zod';
import { Alert } from '@/components/ui/Alert.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { Field, Input } from '@/components/ui/Field.tsx';
import { interpolate } from '@/lib/formatters.ts';
import { AuthLayout } from '@/components/common/AuthLayout.tsx';
import { forgotPassword } from '../api/localAuthApi.ts';
import { LocalAuthError } from '../api/types.ts';
import { AuthCard, CardHeading, PanelCopy } from '../components/AuthParts.tsx';
import { formatLinkDuration, useLinkPolicy } from '../hooks/useLinkPolicy.ts';
import { forgot as copy } from '../content.ts';
import {
  useCountdown,
  useDocumentTitle,
  useFocusOnChange,
  useNoReferrer,
} from '../hooks/useAuthScreen.ts';

const MAX_EMAIL_LENGTH = 254;
const emailFormat = z.string().email();

/** Format only — the server never says whether an address belongs to an account. */
function validateEmail(raw: string): string | undefined {
  const value = raw.trim();
  if (value === '') return copy.emailRequired;
  if (value.length > MAX_EMAIL_LENGTH) return copy.emailTooLong;
  if (!emailFormat.safeParse(value).success) return copy.emailInvalid;
  return undefined;
}

function failureMessage(error: unknown): string {
  return error instanceof LocalAuthError && error.code === 'RATE_LIMITED'
    ? copy.rateLimited
    : copy.failed;
}

const backLinkClass =
  'rounded-sm text-sm font-medium text-violet-700 hover:underline focus-visible:outline-2 focus-visible:outline-violet-600';

/**
 * /forgot-password. Whatever is typed, a well-formed submit ends on the same
 * confirmation: the screen must not reveal whether the address has an account.
 */
export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [isSending, setSending] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  // The address the confirmation was sent for, so "Send again" reuses it.
  const [sentTo, setSentTo] = useState<string | null>(null);
  const cooldown = useCountdown();
  const policy = useLinkPolicy();

  useDocumentTitle(copy.title);
  useNoReferrer();
  const headingRef = useFocusOnChange<HTMLHeadingElement>(sentTo !== null);

  async function send(address: string): Promise<boolean> {
    setSending(true);
    setBanner(null);
    try {
      await forgotPassword(address);
      setSentTo(address);
      if (policy) cooldown.start(policy.resendCooldownSeconds);
      return true;
    } catch (cause) {
      setBanner(failureMessage(cause));
      return false;
    } finally {
      setSending(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const problem = validateEmail(email);
    setFieldError(problem);
    if (problem !== undefined || isSending) return;
    await send(email.trim());
  }

  return (
    <AuthLayout
      split="900"
      leftPanel={<PanelCopy heading={copy.leftHeading} steps={copy.steps} />}
      compactHeader={{ heading: copy.leftHeading }}
    >
      <AuthCard>
        {sentTo === null ? (
          <>
            <CardHeading title={copy.title} subtitle={copy.subtitle} headingRef={headingRef} />
            <form onSubmit={(event) => void handleSubmit(event)} noValidate className="space-y-4">
              <Field label={copy.emailLabel} error={fieldError} required>
                <Input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  maxLength={MAX_EMAIL_LENGTH + 1}
                  placeholder={copy.emailPlaceholder}
                  value={email}
                  disabled={isSending}
                  onChange={(event) => {
                    setEmail(event.target.value);
                  }}
                  onBlur={() => {
                    if (email !== '') setFieldError(validateEmail(email));
                  }}
                />
              </Field>

              <div aria-live="polite">
                {banner === null ? null : <Alert tone="danger">{banner}</Alert>}
              </div>

              <Button
                type="submit"
                variant="brand"
                size="lg"
                fullWidth
                isLoading={isSending}
                loadingLabel={copy.submitting}
              >
                {copy.submit}
              </Button>
            </form>

            <p className="mt-5 text-center">
              <Link to={routePaths.login} className={backLinkClass}>
                {copy.back}
              </Link>
            </p>
          </>
        ) : (
          <div className="text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-info-surface text-info">
              <MailCheck className="size-7" aria-hidden="true" />
            </span>
            <div role="status" aria-live="polite">
              <h2
                ref={headingRef}
                tabIndex={-1}
                className="mt-5 font-display text-2xl font-bold text-ink-900 focus:outline-none"
              >
                {copy.sentTitle}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-500">
                {policy
                  ? interpolate(copy.sentTextWithDuration, {
                      duration: formatLinkDuration(policy.resetTtlMinutes),
                    })
                  : copy.sentText}
              </p>
            </div>

            <div aria-live="polite" className="mt-4 text-left">
              {banner === null ? null : <Alert tone="danger">{banner}</Alert>}
            </div>

            <div className="mt-6 space-y-3">
              <Button
                variant="brand"
                size="lg"
                fullWidth
                onClick={() => {
                  void navigate(routePaths.login);
                }}
              >
                {copy.back}
              </Button>
              <Button
                variant="secondary"
                size="lg"
                fullWidth
                disabled={cooldown.isRunning}
                isLoading={isSending}
                onClick={() => {
                  void send(sentTo);
                }}
              >
                {cooldown.isRunning
                  ? interpolate(copy.sendAgainIn, { seconds: cooldown.remaining })
                  : copy.sendAgain}
              </Button>
              <button
                type="button"
                className={backLinkClass}
                onClick={() => {
                  setSentTo(null);
                  setBanner(null);
                }}
              >
                {copy.differentEmail}
              </button>
            </div>
          </div>
        )}
      </AuthCard>
    </AuthLayout>
  );
}
