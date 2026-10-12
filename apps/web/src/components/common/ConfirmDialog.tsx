import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button.tsx';
import { Dialog } from '@/components/ui/Dialog.tsx';
import common from '@/content/common.json';

/**
 * "Are you sure?" for the destructive admin actions — cancel a task, delete a
 * task, deactivate a user, delete a customer.
 *
 * A single component rather than thirteen near-identical dialogs, because the
 * thing worth being consistent about is which button is which: the destructive
 * action is always on the right, always in `danger` tone, and Cancel is always
 * immediately to its left. Reimplementing that per screen is how a Delete button
 * ends up where Cancel was on the previous dialog.
 *
 * `description` carries the confirmation message and `Dialog` renders it in the
 * BODY — it is the question being asked, not a subtitle. `children` is for
 * anything that has to sit under it: the cancellation reason, or the server's
 * refusal when a delete is declined.
 *
 * Initial focus is Radix's: the first tabbable descendant, which is the header
 * close button. Deliberately not overridden — landing on Cancel would be a
 * marginal gain over landing on the other dismissive control, and moving
 * autofocus onto a destructive dialog is not a change to make casually.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  isPending = false,
  tone = 'danger',
  confirmDisabled = false,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string | undefined;
  confirmLabel: string;
  /** Defaults to the shared "Cancel". Overridden where "Cancel" would be ambiguous. */
  cancelLabel?: string | undefined;
  onConfirm: () => void;
  isPending?: boolean | undefined;
  tone?: 'danger' | 'primary' | undefined;
  confirmDisabled?: boolean | undefined;
  /** Optional extra input — the cancellation reason, for instance. */
  children?: ReactNode | undefined;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="sm"
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
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            isLoading={isPending}
            disabled={confirmDisabled}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children ?? null}
    </Dialog>
  );
}
