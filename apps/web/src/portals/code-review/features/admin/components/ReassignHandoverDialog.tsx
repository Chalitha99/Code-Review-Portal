import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { Handover, Task, User } from '@sdp/contracts';
import { Button } from '@/components/ui/Button.tsx';
import { Dialog } from '@/components/ui/Dialog.tsx';
import { Field } from '@/components/ui/Field.tsx';
import { Select, type SelectOption } from '@/components/ui/Select.tsx';
import { ApiError } from '@/lib/apiClient.ts';
import { interpolate } from '@/lib/formatters.ts';
import admin from '@/content/admin.json';
import common from '@/content/common.json';
import { useReassignHandover } from '../api/handovers.ts';

/**
 * Reassign a handed-back review.
 *
 * ⚠️ Our design — handover has no wireframe. Deliberately the same shape as
 * `AssignReviewerDialog` so the two assignment paths look and behave alike; the
 * differences are the self-review exclusion and the reason shown above the
 * picker, which is the whole reason the admin is here.
 *
 * The developer who raised the task is excluded by the self-review rule. The
 * previous reviewer remains eligible when circumstances have changed.
 */

const labels = admin.handovers.reassign;

export function ReassignHandoverDialog({
  handover,
  task,
  users,
  onClose,
}: {
  handover: Handover;
  task: Pick<Task, 'developerId' | 'taskCode'> | undefined;
  users: readonly User[];
  onClose: () => void;
}) {
  const reassign = useReassignHandover();
  const [reviewerId, setReviewerId] = useState('');

  const eligible = useMemo(
    () =>
      users.filter(
        (user) => user.isActive && user.roles.includes('Reviewer') && user.id !== task?.developerId,
      ),
    [users, task?.developerId],
  );

  const options: SelectOption[] = eligible.map((user) => ({ value: user.id, label: user.name }));

  function submit() {
    if (reviewerId === '') return;
    const name = eligible.find((user) => user.id === reviewerId)?.name ?? '';

    reassign.mutate(
      { handoverId: handover.id, reviewerId },
      {
        onSuccess: () => {
          toast.success(interpolate(labels.success, { taskCode: task?.taskCode ?? '', name }));
          onClose();
        },
        onError: (cause) => {
          toast.error(cause instanceof ApiError ? cause.message : common.errors.generic);
        },
      },
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={labels.title}
      description={interpolate(labels.description, {
        taskCode: task?.taskCode ?? '',
        name: handover.fromReviewerName,
      })}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {common.actions.cancel}
          </Button>
          <Button
            variant="adminPrimary"
            onClick={submit}
            disabled={reviewerId === '' || eligible.length === 0}
            isLoading={reassign.isPending}
          >
            {reassign.isPending ? labels.submitting : labels.submit}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-card bg-canvas p-3">
          <p className="text-xs font-semibold tracking-wide text-ink-500 uppercase">
            {labels.reasonLabel}
          </p>
          {/* Reviewer-authored text: escaped, never HTML. */}
          <p className="mt-1 text-sm whitespace-pre-wrap text-ink-700">{handover.reason}</p>
        </div>

        <Field label={labels.label} hint={labels.hint}>
          <Select
            value={reviewerId}
            onValueChange={setReviewerId}
            options={options}
            placeholder={labels.placeholder}
            disabled={eligible.length === 0}
            aria-label={labels.label}
          />
        </Field>

        {eligible.length === 0 ? <p className="text-sm text-danger">{labels.noReviewers}</p> : null}
      </div>
    </Dialog>
  );
}
