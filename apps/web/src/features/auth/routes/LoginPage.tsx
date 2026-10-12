import { useEffect, useState, type InputHTMLAttributes } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/components/ui';
import { Alert } from '@/components/ui/Alert.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { Field, Input } from '@/components/ui/Field.tsx';
import { useFieldControlProps } from '@/components/ui/fieldContext.ts';
import { Divider } from '@/components/ui/Card.tsx';
import { ApiError } from '@/lib/apiClient.ts';
import { interpolate } from '@/lib/formatters.ts';
import { useSession } from '@/hooks/useSession.ts';
import content from '@/content/login.json';
import { AuthLayout } from '@/components/common/AuthLayout.tsx';
import { SessionExpiredNotice } from '../components/SessionExpiredNotice.tsx';
import { useLogin } from '../api/queries.ts';
import { loginDefaults, loginSchema, type LoginInput } from '../domain/loginSchema.ts';

/**
 * Password input with a visibility toggle.
 *
 * Uses `useFieldControlProps` so it inherits the same id and ARIA wiring a
 * plain `Input` would, without `Field` needing to know about the toggle.
 */
function PasswordInput({ placeholder, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const [isVisible, setIsVisible] = useState(false);
  const { hasError, ...fieldProps } = useFieldControlProps();

  return (
    <div className="relative">
      <input
        type={isVisible ? 'text' : 'password'}
        placeholder={placeholder}
        autoComplete="current-password"
        className={cn(
          'block w-full rounded-control border bg-surface py-2 pr-11 pl-3 text-sm text-ink-900',
          'placeholder:text-ink-400',
          'transition-colors focus-visible:outline-2 focus-visible:outline-offset-0',
          hasError
            ? 'border-danger focus-visible:outline-danger'
            : 'border-line-strong focus-visible:outline-violet-600',
        )}
        {...fieldProps}
        {...props}
      />
      <button
        type="button"
        onClick={() => setIsVisible((v) => !v)}
        // Outside the tab order: the expected path is label → input → submit.
        // Still reachable with Shift+Tab, and its state is announced.
        tabIndex={-1}
        aria-pressed={isVisible}
        aria-label={isVisible ? content.form.hidePassword : content.form.showPassword}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-control text-ink-400 transition-colors hover:text-ink-700"
      >
        {isVisible ? (
          <EyeOff className="size-4" aria-hidden="true" />
        ) : (
          <Eye className="size-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

export function LoginPage({
  onSignedIn,
  forgotPasswordTo,
}: {
  onSignedIn: () => void;
  /** Where "Forgot password?" goes. Omit to hide the link. */
  forgotPasswordTo?: string | undefined;
}) {
  const login = useLogin();
  // Set by the session store when a session times out, rather than read from the
  // URL: a query string survives bookmarking and sharing, and "your session
  // expired" is only true for the person it just happened to.
  const didExpire = useSession((state) => state.didExpire);

  // `?reason=password-saved` is a one-shot hand-off from the password screen.
  // Read into state first, then stripped, so the banner outlives the URL change
  // and a refresh or a shared link does not repeat it.
  const [searchParams, setSearchParams] = useSearchParams();
  const [showPasswordSaved] = useState(() => searchParams.get('reason') === 'password-saved');
  useEffect(() => {
    if (searchParams.get('reason') !== 'password-saved') return;
    const next = new URLSearchParams(searchParams);
    next.delete('reason');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: loginDefaults,
    // On blur, not on every keystroke: errors appearing mid-typing read as nagging.
    mode: 'onBlur',
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const user = await login.mutateAsync(values);
      toast.success(interpolate(content.messages.success, { name: user.name }));
      onSignedIn();
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : content.messages.invalidCredentials;
      toast.error(message);
    }
  });

  const serverError = login.isError && login.error instanceof ApiError ? login.error.message : null;
  const isBusy = isSubmitting || login.isPending;

  return (
    <AuthLayout
      leftPanel={
        <>
          {/*
            Each block arrives on its own short delay. One-shot `reveal-up`, not a
            loop: the panel settles within ~400ms and is then completely still,
            which is the correct amount of movement next to a password field.
          */}
          <p className="animate-reveal-up text-[0.7rem] font-semibold tracking-[0.28em] text-white/70 uppercase">
            {content.brandPanel.eyebrow}
          </p>

          {/* `text-white` is required, not decorative. The base layer in
              global.css sets an explicit colour on h1–h4, and an explicit
              declaration beats the inherited white from the section — without
              this the heading renders navy-on-purple. */}
          <h1 className="mt-4 animate-reveal-up font-display text-4xl leading-[1.1] font-extrabold text-white [animation-delay:70ms] xl:text-5xl">
            {content.brandPanel.title}
          </h1>

          <p className="mt-5 max-w-sm animate-reveal-up text-sm leading-relaxed text-white/80 [animation-delay:140ms]">
            {content.brandPanel.subtitle}
          </p>

          {/*
            A hairline above the list, so the three promises read as a distinct
            band rather than as a fourth paragraph. Short and left-aligned — a
            full-width rule across the panel would fight the gradient.
          */}
          <span
            className="mt-9 block h-px w-16 animate-reveal-fade bg-white/40 [animation-delay:200ms]"
            aria-hidden="true"
          />

          <ul className="mt-6 space-y-3.5">
            {content.brandPanel.highlights.map((highlight, index) => (
              <li
                key={highlight}
                className="flex animate-reveal-up items-start gap-3 text-sm text-white/90"
                style={{ animationDelay: `${String(240 + index * 70)}ms` }}
              >
                <span
                  className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-white/20 ring-1 ring-white/25"
                  aria-hidden="true"
                >
                  <Check className="size-3" />
                </span>
                <span className="leading-6">{highlight}</span>
              </li>
            ))}
          </ul>
        </>
      }
    >
      {/* Only after a timeout, and it clears itself once read. */}
      {didExpire ? <SessionExpiredNotice /> : null}

      {/* After setting a password. The parameter is already gone from the URL. */}
      {showPasswordSaved ? (
        <div role="status" aria-live="polite" className="mb-5">
          <Alert tone="info">{content.messages.passwordSaved}</Alert>
        </div>
      ) : null}

      <header>
        <h2 className="font-display text-2xl font-bold text-ink-900">{content.form.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-500">{content.form.subtitle}</p>
      </header>

      <form onSubmit={(e) => void onSubmit(e)} noValidate className="mt-7 space-y-4">
        <Field label={content.form.emailLabel} error={errors.email?.message} required>
          {/* No autoFocus: it would jump past the heading before a screen
              reader has announced it. */}
          <Input
            type="email"
            autoComplete="username"
            placeholder={content.form.emailPlaceholder}
            {...register('email')}
          />
        </Field>

        <div>
          <Field label={content.form.passwordLabel} error={errors.password?.message} required>
            <PasswordInput
              placeholder={content.form.passwordPlaceholder}
              {...register('password')}
            />
          </Field>
          {forgotPasswordTo !== undefined ? (
            <Link
              to={forgotPasswordTo}
              className="mt-2 inline-block rounded-sm text-sm font-medium text-violet-700 hover:underline focus-visible:outline-2 focus-visible:outline-violet-600"
            >
              {content.form.forgotPassword}
            </Link>
          ) : null}
        </div>

        <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            className="size-4 rounded border-line-strong accent-violet-600"
            {...register('remember')}
          />
          {content.form.remember}
        </label>

        {serverError === null ? null : (
          <p
            role="alert"
            className="rounded-control border border-danger/30 bg-danger-surface px-3 py-2 text-sm font-medium text-danger"
          >
            {serverError}
          </p>
        )}

        <Button
          type="submit"
          variant="brand"
          size="lg"
          fullWidth
          isLoading={isBusy}
          loadingLabel={content.form.submitting}
        >
          {content.form.submit}
        </Button>
      </form>

      {/* SSO sits BELOW the credential form and in a secondary style,
          because credentials are the working path in Phase 1 and this
          button is inert. Both flip when Keycloak goes live: SSO becomes
          the primary action and moves above the form. */}
      <Divider label={content.form.dividerLabel} className="my-5" />

      <Button
        variant="secondary"
        size="lg"
        fullWidth
        leadingIcon={<ShieldCheck className="size-4" aria-hidden="true" />}
        onClick={() => toast.info(content.messages.ssoUnavailable)}
      >
        {content.form.ssoButton}
      </Button>
    </AuthLayout>
  );
}
