import { useId, useState, type FormEvent, type InputHTMLAttributes } from 'react';
import { Check, Eye, EyeOff, X } from 'lucide-react';
import { cn } from '@/components/ui';
import { Button } from '@/components/ui/Button.tsx';
import { Field } from '@/components/ui/Field.tsx';
import { useFieldControlProps } from '@/components/ui/fieldContext.ts';
import { setPassword as copy } from '../content.ts';
import {
  CHECKLIST_RULES,
  PASSWORD_MAX_LENGTH,
  STRENGTH_LABELS,
  checklistStatus,
  isPasswordAcceptable,
  passwordLength,
  passwordStrength,
  type ChecklistRuleId,
  type RuleCode,
  type StrengthLevel,
} from '../domain/passwordRules.ts';
import { useFocusOnChange } from '../hooks/useAuthScreen.ts';

/**
 * Password input with a show/hide toggle.
 *
 * Unlike the sign-in field, the toggle is in the tab order: this screen must be
 * fully usable by keyboard, and a hidden control is the only way to check a typo
 * in a password you cannot see.
 */
function PasswordField({
  extraDescribedBy,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { extraDescribedBy?: string | undefined }) {
  const [isVisible, setIsVisible] = useState(false);
  const { hasError, 'aria-describedby': ownDescribedBy, ...fieldProps } = useFieldControlProps();
  const describedBy = [ownDescribedBy, extraDescribedBy].filter(Boolean).join(' ');

  return (
    <div className="relative">
      <input
        type={isVisible ? 'text' : 'password'}
        // Browsers offer to save and generate a password for this; the user may paste one.
        autoComplete="new-password"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        maxLength={PASSWORD_MAX_LENGTH}
        className={cn(
          'block w-full rounded-control border bg-surface py-2 pr-11 pl-3 text-sm text-ink-900',
          'transition-colors focus-visible:outline-2 focus-visible:outline-offset-0',
          'disabled:cursor-not-allowed disabled:bg-canvas disabled:text-ink-400',
          hasError
            ? 'border-danger focus-visible:outline-danger'
            : 'border-line-strong focus-visible:outline-violet-600',
        )}
        {...fieldProps}
        {...(describedBy === '' ? {} : { 'aria-describedby': describedBy })}
        {...props}
      />
      <button
        type="button"
        onClick={() => {
          setIsVisible((visible) => !visible);
        }}
        disabled={props.disabled === true}
        aria-pressed={isVisible}
        aria-label={isVisible ? copy.hide : copy.show}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-control text-ink-500 transition-colors hover:text-ink-700 focus-visible:outline-2 focus-visible:outline-violet-600 disabled:cursor-not-allowed disabled:opacity-50"
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

const SEGMENT_TONE: Record<StrengthLevel, string> = {
  0: 'bg-line',
  1: 'bg-danger',
  2: 'bg-warning',
  3: 'bg-info',
  4: 'bg-success',
};

/** Four segments and a word. A hint only: the checklist is what gates the button. */
function StrengthBar({ level }: { level: StrengthLevel }) {
  return (
    <div className="flex items-center gap-3" data-testid="strength-bar" data-level={level}>
      <div className="flex flex-1 gap-1.5" aria-hidden="true">
        {[1, 2, 3, 4].map((segment) => (
          <span
            key={segment}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-colors',
              segment <= level ? SEGMENT_TONE[level] : 'bg-line',
            )}
          />
        ))}
      </div>
      <p className="text-ink-600 min-w-16 text-right text-xs font-medium whitespace-nowrap">
        {level === 0 ? copy.strength : STRENGTH_LABELS[level]}
      </p>
    </div>
  );
}

/** Compact chips instead of a list: six rules fit in three short rows. */
function Checklist({
  id,
  status,
  serverFailed,
}: {
  id: string;
  status: Record<ChecklistRuleId, boolean>;
  serverFailed: ReadonlySet<ChecklistRuleId>;
}) {
  return (
    <ul id={id} aria-label={copy.rulesHeading} className="flex flex-wrap gap-2">
      {CHECKLIST_RULES.map((rule) => {
        // The server said no: show it as failed even if the live check disagrees.
        const met = status[rule.id] && !serverFailed.has(rule.id);
        return (
          <li
            key={rule.id}
            data-rule={rule.id}
            data-met={met}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
              met
                ? 'border-success/30 bg-success-surface text-success'
                : 'text-ink-600 border-line bg-surface',
            )}
          >
            {met ? (
              <Check className="size-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <X className="size-3.5 shrink-0 text-ink-400" aria-hidden="true" />
            )}
            <span>{rule.label}</span>
            <span className="sr-only">{met ? ' — met' : ' — not met'}</span>
          </li>
        );
      })}
    </ul>
  );
}

export interface PasswordFormProps {
  submitLabel: string;
  /** True while the request is in flight. Fields lock and the button spins. */
  isSaving: boolean;
  /** Banner text for a failed save. Focus moves to it when it changes. */
  error: string | null;
  /** Rules the server rejected, to mark in the checklist until the user edits. */
  serverFailedRules: readonly RuleCode[];
  /** Resolves when the request settles. The password is dropped from state after. */
  onSubmit: (password: string) => Promise<void>;
}

/**
 * New password + confirmation, with the live rule checklist and strength hint.
 *
 * The password lives in this component's state and nowhere else — not in a store,
 * a ref, storage or a log. It is cleared as soon as the request settles, and goes
 * with the component when the screen unmounts. It is never trimmed, hashed or
 * encrypted here: TLS carries it and the backend hashes it.
 */
export function PasswordForm({
  submitLabel,
  isSaving,
  error,
  serverFailedRules,
  onSubmit,
}: PasswordFormProps) {
  const checklistId = useId();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  // Server verdicts apply only until the next keystroke.
  const [editedSinceSubmit, setEditedSinceSubmit] = useState(false);
  const errorRef = useFocusOnChange<HTMLDivElement>(error);

  const status = checklistStatus(password, confirm);
  const canSubmit = isPasswordAcceptable(password, confirm) && !isSaving;

  const flagged = editedSinceSubmit ? [] : serverFailedRules;
  const serverFailed = new Set<ChecklistRuleId>(
    flagged.filter((code): code is Exclude<RuleCode, 'MAX_LENGTH'> => code !== 'MAX_LENGTH'),
  );

  function edit(update: () => void) {
    update();
    setEditedSinceSubmit(true);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    const submitted = password;
    try {
      await onSubmit(submitted);
    } finally {
      setPassword('');
      setConfirm('');
      setEditedSinceSubmit(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} noValidate className="space-y-4">
      <Field
        label={copy.newPassword}
        required
        hint={passwordLength(password) >= PASSWORD_MAX_LENGTH ? copy.maxReached : undefined}
      >
        <PasswordField
          value={password}
          disabled={isSaving}
          extraDescribedBy={checklistId}
          onChange={(event) => {
            edit(() => {
              setPassword(event.target.value);
            });
          }}
        />
      </Field>

      <Field label={copy.confirmPassword} required>
        <PasswordField
          value={confirm}
          disabled={isSaving}
          onChange={(event) => {
            edit(() => {
              setConfirm(event.target.value);
            });
          }}
        />
      </Field>

      <div className="space-y-3 rounded-control bg-canvas p-3.5">
        <StrengthBar level={passwordStrength(password)} />
        <Checklist id={checklistId} status={status} serverFailed={serverFailed} />
      </div>

      {/* Always mounted so the live region exists before the message arrives. */}
      <div aria-live="polite">
        {error === null ? null : (
          <div
            ref={errorRef}
            tabIndex={-1}
            role="alert"
            className="rounded-control border border-danger/30 bg-danger-surface px-3 py-2 text-sm font-medium text-danger focus-visible:outline-2 focus-visible:outline-danger"
          >
            {error}
          </div>
        )}
      </div>

      <Button
        type="submit"
        variant="brand"
        size="lg"
        fullWidth
        disabled={!canSubmit}
        isLoading={isSaving}
      >
        {submitLabel}
      </Button>
    </form>
  );
}
