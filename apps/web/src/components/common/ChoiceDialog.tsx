import type { ReactNode } from 'react';
import { AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/components/ui';
import { Button } from '@/components/ui/Button.tsx';
import { Dialog } from '@/components/ui/Dialog.tsx';
import common from '@/content/common.json';

/**
 * One question, TWO named outcomes, plus a way out.
 *
 * `ConfirmDialog` is the two-button case — do the thing, or do not — and it is
 * the right component for nine call sites. It is the wrong one here, because
 * "the order you asked for is taken" has no single confirm: keeping both records
 * and replacing one are both valid answers, and neither is the dismissal. Bolting
 * a third button onto `ConfirmDialog` would have made `confirmLabel` mean
 * "primary of two", which is how a shared component starts lying about itself.
 *
 * The two are deliberately consistent where it matters: dismissive on the left,
 * actions on the right, primary outermost. That ordering is the thing a user
 * learns once, and a dialog that reverses it is how a Delete lands where Cancel
 * was.
 *
 * `description` goes to `Dialog`'s body slot, so it renders full width above the
 * icon and the hint list rather than as a subtitle. The icon marks the tone of
 * the choice being offered.
 *
 * TONES follow `ui/Alert.tsx` rather than inventing a second vocabulary, and
 * follow the house `const RECORD = {...} as const` lookup rather than adding a
 * second `cva` (`buttonVariants` is the only one, on purpose).
 */

const TONES = {
  info: { wrap: 'bg-info-surface text-info', Icon: Info },
  warning: { wrap: 'bg-warning-surface text-warning', Icon: AlertTriangle },
  danger: { wrap: 'bg-danger-surface text-danger', Icon: AlertCircle },
} as const;

export interface DialogChoice {
  label: string;
  /** Supporting line under the label. Say what the choice DOES, not that it is safe. */
  hint?: string | undefined;
  onSelect: () => void;
}

export function ChoiceDialog({
  open,
  onOpenChange,
  tone = 'info',
  title,
  description,
  children,
  primaryChoice,
  secondaryChoice,
  cancelLabel,
  isPending = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tone?: keyof typeof TONES | undefined;
  title: string;
  description?: string | undefined;
  /** Detail above the choices — the record in question, the consequence. */
  children?: ReactNode | undefined;
  /** The recommended outcome. Rendered rightmost, in the filled button. */
  primaryChoice: DialogChoice;
  secondaryChoice: DialogChoice;
  /** Defaults to the shared "Cancel". */
  cancelLabel?: string | undefined;
  isPending?: boolean | undefined;
}) {
  const { wrap, Icon } = TONES[tone];

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      {...(description === undefined ? {} : { description })}
      size="md"
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            {cancelLabel ?? common.actions.cancel}
          </Button>
          <Button variant="secondary" onClick={secondaryChoice.onSelect} isLoading={isPending}>
            {secondaryChoice.label}
          </Button>
          <Button onClick={primaryChoice.onSelect} isLoading={isPending}>
            {primaryChoice.label}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-4">
        {/*
          Decorative. The tone is already carried by the title and the body copy;
          an icon that announced itself would read the word "Info" before the
          sentence that matters.
        */}
        <span
          className={cn('grid size-10 shrink-0 place-items-center rounded-full', wrap)}
          aria-hidden="true"
        >
          <Icon className="size-5" />
        </span>

        <div className="min-w-0 flex-1 space-y-4">
          {children}

          {/*
            The consequences spelled out beside their buttons.

            A modal whose only labels are "Yes" and "No" makes the user guess
            which is which, and this pair is not guessable — "yes" to a question
            about a duplicate could as easily mean "yes, overwrite it". The
            buttons carry the outcome too; this list is where there is room to
            say it in full, in the same left-to-right order the footer uses.
          */}
          <dl className="space-y-2 text-sm">
            {[secondaryChoice, primaryChoice].map((choice) =>
              choice.hint === undefined ? null : (
                <div
                  key={choice.label}
                  className="flex flex-wrap gap-x-2 rounded-control bg-canvas px-3 py-2"
                >
                  <dt className="font-semibold text-ink-900">{choice.label}</dt>
                  <dd className="min-w-0 flex-1 text-ink-700">{choice.hint}</dd>
                </div>
              ),
            )}
          </dl>
        </div>
      </div>
    </Dialog>
  );
}
