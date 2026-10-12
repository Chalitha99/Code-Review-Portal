import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { TaskListItem, User } from '@sdp/contracts';
import { Button } from '@/components/ui/Button.tsx';
import { Dialog } from '@/components/ui/Dialog.tsx';
import { Field } from '@/components/ui/Field.tsx';
import { Select, type SelectOption } from '@/components/ui/Select.tsx';
import { Textarea } from '@/components/ui/controls.tsx';
import { ApiError } from '@/lib/apiClient.ts';
import { interpolate } from '@/lib/formatters.ts';
import admin from '@/content/admin.json';
import common from '@/content/common.json';
import { useAssignReviewer, useChangeResubmissionReviewer } from '../api/queries.ts';

/**
 * Assign or reassign a reviewer (screen 01's person-plus row action).
 *
 * Supports initial assignment for Submitted/ReSubmitted tasks,
 * re-assignment with mandatory reason for InReview tasks, and — for a
 * ChangesRequested task — choosing the follow-up reviewer who receives it on
 * resubmission (docs/25-review-assignment-rules.md), also with a reason.
 */
export function AssignReviewerDialog({
  task,
  users,
  onClose,
}: {
  /** The task being assigned. The caller mounts this only when there is one. */
  task: TaskListItem;
  users: readonly User[];
  onClose: () => void;
}) {
  const assign = useAssignReviewer();
  const changeFollowUp = useChangeResubmissionReviewer();
  const isFollowUp = task.status === 'ChangesRequested';
  const isReassign = task.status === 'InReview';
  const followUp = admin.tasks.followUp;

  // Seeded on mount: for reassign, start empty so admin explicitly selects a new reviewer
  const [reviewerId, setReviewerId] = useState(isReassign ? '' : (task.reviewerId ?? ''));
  const [reason, setReason] = useState('');

  const eligible = useMemo(
    () =>
      users.filter(
        (user) =>
          user.isActive &&
          user.roles.includes('Reviewer') &&
          user.id !== task.developerId &&
          (!isReassign || user.id !== task.reviewerId),
      ),
    [users, task.developerId, task.reviewerId, isReassign],
  );

  const options: SelectOption[] = eligible.map((user) => ({ value: user.id, label: user.name }));

  function submit() {
    if (reviewerId === '') return;
    if ((isReassign || isFollowUp) && reason.trim() === '') return;
    const reviewerName = eligible.find((user) => user.id === reviewerId)?.name ?? '';

    if (isFollowUp) {
      changeFollowUp.mutate(
        { taskId: task.id, reviewerId, reason: reason.trim() },
        {
          onSuccess: () => {
            toast.success(
              interpolate(followUp.success, { taskCode: task.taskCode, name: reviewerName }),
            );
            onClose();
          },
          onError: (cause) => {
            toast.error(cause instanceof ApiError ? cause.message : common.errors.generic);
          },
        },
      );
      return;
    }

    assign.mutate(
      { taskId: task.id, reviewerId, reason: isReassign ? reason.trim() : undefined },
      {
        onSuccess: () => {
          toast.success(
            interpolate(
              isReassign ? '{taskCode} reassigned to {name}.' : admin.tasks.assign.success,
              {
                taskCode: task.taskCode,
                name: reviewerName,
              },
            ),
          );
          onClose();
        },
        onError: (cause) => {
          toast.error(cause instanceof ApiError ? cause.message : common.errors.generic);
        },
      },
    );
  }

  const needsReason = isReassign || isFollowUp;
  const isSubmitDisabled =
    reviewerId === '' || eligible.length === 0 || (needsReason && reason.trim() === '');
  const isPending = assign.isPending || changeFollowUp.isPending;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={
        isFollowUp ? followUp.title : isReassign ? 'Reassign Reviewer' : admin.tasks.assign.title
      }
      description={
        isFollowUp
          ? interpolate(followUp.description, { taskCode: task.taskCode })
          : isReassign
            ? `Choose a new reviewer to take over ${task.taskCode}.`
            : interpolate(admin.tasks.assign.description, {
                taskCode: task.taskCode,
              })
      }
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {common.actions.cancel}
          </Button>
          <Button
            variant="adminPrimary"
            onClick={submit}
            disabled={isSubmitDisabled}
            isLoading={isPending}
          >
            {isFollowUp
              ? isPending
                ? followUp.submitting
                : followUp.submit
              : isPending
                ? isReassign
                  ? 'Reassigning…'
                  : admin.tasks.assign.submitting
                : isReassign
                  ? 'Reassign Reviewer'
                  : admin.tasks.assign.submit}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field
          label={
            isFollowUp ? followUp.label : isReassign ? 'New Reviewer' : admin.tasks.assign.label
          }
          hint={admin.tasks.assign.ownerExcluded}
        >
          <Select
            value={reviewerId}
            onValueChange={setReviewerId}
            options={options}
            placeholder={
              isFollowUp
                ? followUp.placeholder
                : isReassign
                  ? 'Select a new reviewer'
                  : admin.tasks.assign.placeholder
            }
            disabled={eligible.length === 0}
            aria-label={
              isFollowUp ? followUp.label : isReassign ? 'New Reviewer' : admin.tasks.assign.label
            }
          />
        </Field>

        {isReassign ? (
          <Field label="Reassignment Reason (required)">
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Why is this reviewer being reassigned?"
            />
          </Field>
        ) : null}

        {isFollowUp ? (
          <Field label={followUp.reasonLabel}>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder={followUp.reasonPlaceholder}
            />
          </Field>
        ) : null}

        {eligible.length === 0 ? (
          <p className="text-sm text-danger">{admin.tasks.assign.noReviewers}</p>
        ) : null}

        {task.reviewerName === null ? null : (
          <p className="text-sm text-ink-500">
            {interpolate(admin.tasks.assign.currentReviewer, { name: task.reviewerName })}
          </p>
        )}
      </div>
    </Dialog>
  );
}
