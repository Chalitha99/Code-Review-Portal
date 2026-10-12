import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { routePaths } from '@/constants/routePaths';
import { Alert } from '@/components/ui/Alert.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { interpolate } from '@/lib/formatters.ts';
import { AuthLayout } from '@/components/common/AuthLayout.tsx';
import { Hourglass } from '@/components/common/Hourglass.tsx';
import { resendLink } from '../api/localAuthApi.ts';
import { LocalAuthError } from '../api/types.ts';
import { AuthCard, PanelCopy } from '../components/AuthParts.tsx';
import { formatLinkDuration, useLinkPolicy } from '../hooks/useLinkPolicy.ts';
import { expired as copy } from '../content.ts';
import {
  useCountdown,
  useDocumentTitle,
  useFocusOnChange,
  useNoReferrer,
} from '../hooks/useAuthScreen.ts';
import { adoptTokenFromHistoryState } from '../lib/tokenStore.ts';
import type { LinkExpiredState } from './navigation.ts';

type SendState = 'idle' | 'sending' | 'sent' | 'error';

/**
 * /link-expired. Told what happened through router state — `{ reason, purpose,
 * token }` — so none of it is ever in the address bar. A reload loses the token
 * (it is kept in memory only), and the screen then offers the forgot-password
 * route instead of a resend it can no longer perform.
 */
export function LinkExpiredPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LinkExpiredState | null;
  const reason = state?.reason === 'expired' ? 'expired' : 'invalid';

  const [token] = useState(() => adoptTokenFromHistoryState(state?.token));
  const [send, setSend] = useState<SendState>('idle');
  const [errorText, setErrorText] = useState<string>(copy.failed);
  const cooldown = useCountdown();
  const policy = useLinkPolicy();

  useDocumentTitle(copy.title);
  useNoReferrer();
  const headingRef = useFocusOnChange<HTMLHeadingElement>(reason);

  async function handleResend() {
    if (token === null || send === 'sending' || cooldown.isRunning) return;
    setSend('sending');
    try {
      await resendLink(token);
      setSend('sent');
      if (policy) cooldown.start(policy.resendCooldownSeconds);
    } catch (cause) {
      setErrorText(
        cause instanceof LocalAuthError && cause.code === 'RATE_LIMITED'
          ? copy.rateLimited
          : copy.failed,
      );
      setSend('error');
    }
  }

  const isExpired = reason === 'expired';
  const lifetimeMinutes =
    policy === null
      ? null
      : state?.purpose === 'RESET'
        ? policy.resetTtlMinutes
        : policy.inviteTtlMinutes;

  const sendLabel =
    send === 'sending'
      ? copy.sending
      : cooldown.isRunning
        ? interpolate(copy.sentAgainIn, { seconds: cooldown.remaining })
        : copy.send;

  return (
    <AuthLayout
      split="900"
      leftPanel={<PanelCopy heading={copy.leftHeading} text={copy.leftText} />}
      compactHeader={{ heading: copy.leftHeading, text: copy.leftText }}
    >
      <AuthCard className="text-center">
        <div className="flex justify-center">
          <Hourglass size="lg" />
        </div>

        <p className="mt-7 text-xs font-semibold tracking-[0.18em] text-warning uppercase">
          {isExpired ? copy.badgeExpired : copy.badgeInvalid}
        </p>
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="mt-2 font-display text-2xl font-bold text-ink-900 focus:outline-none"
        >
          {isExpired ? copy.expiredTitle : copy.invalidTitle}
        </h2>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-ink-500">
          {isExpired
            ? lifetimeMinutes === null
              ? copy.expiredTextNoDuration
              : interpolate(copy.expiredText, { duration: formatLinkDuration(lifetimeMinutes) })
            : copy.invalidText}
        </p>

        <div className="mt-7 space-y-3">
          {isExpired ? (
            token === null ? (
              <Button
                variant="brand"
                size="lg"
                fullWidth
                trailingIcon={<ArrowRight className="size-4" aria-hidden="true" />}
                onClick={() => {
                  void navigate(routePaths.forgotPassword);
                }}
              >
                {copy.requestNew}
              </Button>
            ) : (
              <>
                <Button
                  variant="brand"
                  size="lg"
                  fullWidth
                  disabled={cooldown.isRunning}
                  isLoading={send === 'sending'}
                  onClick={() => void handleResend()}
                >
                  {sendLabel}
                </Button>
                <div aria-live="polite" className="text-left">
                  {send === 'sent' ? <Alert tone="success">{copy.sent}</Alert> : null}
                  {send === 'error' ? <Alert tone="danger">{errorText}</Alert> : null}
                </div>
              </>
            )
          ) : (
            <>
              <Button
                variant="brand"
                size="lg"
                fullWidth
                onClick={() => {
                  void navigate(routePaths.login);
                }}
              >
                {copy.goToSignIn}
              </Button>
              <Button
                variant="secondary"
                size="lg"
                fullWidth
                onClick={() => {
                  void navigate(routePaths.forgotPassword);
                }}
              >
                {copy.forgot}
              </Button>
            </>
          )}
        </div>

        {isExpired ? (
          <p className="mt-5">
            <Link
              to={routePaths.login}
              className="rounded-sm text-sm font-medium text-violet-700 hover:underline focus-visible:outline-2 focus-visible:outline-violet-600"
            >
              {copy.back}
            </Link>
          </p>
        ) : null}
      </AuthCard>
    </AuthLayout>
  );
}
