import { useState } from 'react';
import { AlertTriangle, ArrowRightLeft, Check, Info, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { createHandoverInputSchema, type ReviewDraft, type TaskListItem } from '@sdp/contracts';
import { Button } from '@/components/ui/Button.tsx';
import { Dialog } from '@/components/ui/Dialog.tsx';
import { Textarea } from '@/components/ui/controls.tsx';
import { Field } from '@/components/ui/Field.tsx';
import { ApiError } from '@/lib/apiClient.ts';
import { interpolate, textOr } from '@/lib/formatters.ts';
import common from '@/content/common.json';
import reviews from '@/content/reviews.json';
import { useHandOver } from '../api/queries.ts';
import { RANK_DETAILS } from '../domain/reviewRules.ts';

/**
 * Hand a review back to the admin pool for reassignment.
 *
 * Operational transfer of review ownership when the assigned reviewer cannot
 * continue (e.g. sick leave, capacity, domain specialization needed).
 * Preserves the active review draft and original comment authorship.
 *
 * Enforces ownership rule: Review Rank belongs ONLY to the final reviewer.
 * If a rank is selected, Hand Over requires clearing the rank first.
 */
export function HandoverDialog({
  task,
  draft,
  onClearRank,
  onClose,
  onSuccess,
}: {
  task: TaskListItem;
  draft?: ReviewDraft | undefined;
  onClearRank?: (() => void) | undefined;
  onClose: () => void;
  onSuccess?: (() => void) | undefined;
}) {
  const handOver = useHandOver(task.id);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [isSuccess, setIsSuccess] = useState(false);
  const [rankCleared, setRankCleared] = useState(false);

  const hasSelectedRank = !rankCleared && draft?.rank != null;

  function handleClearRankAndContinue() {
    setRankCleared(true);
    onClearRank?.();
  }

  function submit() {
    if (handOver.isPending || isSuccess) return;

    const trimmed = reason.trim();
    if (!trimmed) {
      setError('Explain why this review is being handed over.');
      return;
    }

    const sanitizedDraft = draft
      ? { ...draft, rank: null, previousFeedbackReviewNote: null }
      : undefined;

    const parsed = createHandoverInputSchema.safeParse({ reason: trimmed, draft: sanitizedDraft });
    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ?? 'Please provide a reason for handing over this review.',
      );
      return;
    }
    setError(undefined);

    handOver.mutate(parsed.data, {
      onSuccess: (updated) => {
        setIsSuccess(true);
        toast.success(interpolate(reviews.form.handoverSuccess, { taskCode: updated.taskCode }));
        setTimeout(() => {
          onSuccess?.();
          onClose();
        }, 800);
      },
      onError: (cause) => {
        toast.error(cause instanceof ApiError ? cause.message : common.errors.generic);
      },
    });
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !isSuccess && !handOver.isPending) {
          onClose();
        }
      }}
      size="md"
      icon={
        isSuccess ? (
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20">
            <Check className="size-5" aria-hidden="true" />
          </div>
        ) : hasSelectedRank ? (
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/20">
            <AlertTriangle className="size-5" aria-hidden="true" />
          </div>
        ) : (
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/20">
            <ArrowRightLeft className="size-5" aria-hidden="true" />
          </div>
        )
      }
      title={
        isSuccess
          ? 'Review Handed Over'
          : hasSelectedRank
            ? 'Review Rank Cannot Be Handed Over'
            : reviews.form.handoverTitle
      }
      subtitle={
        isSuccess
          ? 'The task has been sent to Admin for reassignment.'
          : hasSelectedRank
            ? 'The review rank represents the final assessment decision and must be provided by the reviewer who completes the review.'
            : reviews.form.handoverSubtitle
      }
      footer={
        isSuccess ? null : hasSelectedRank ? (
          <div className="flex w-full flex-wrap items-center justify-between gap-3 pt-1">
            <Button variant="secondary" onClick={onClose}>
              {common.actions.cancel}
            </Button>

            <Button
              type="button"
              onClick={handleClearRankAndContinue}
              className="gap-1.5 bg-amber-600 font-semibold text-white shadow-2xs hover:bg-amber-700 focus-visible:outline-amber-600 active:bg-amber-800"
            >
              Clear Rank & Hand Over
            </Button>
          </div>
        ) : (
          <div className="flex w-full flex-wrap items-center justify-between gap-3 pt-1">
            <Button variant="secondary" disabled={handOver.isPending} onClick={onClose}>
              {common.actions.cancel}
            </Button>

            <Button
              type="button"
              onClick={submit}
              isLoading={handOver.isPending}
              loadingLabel={reviews.form.handoverConfirming}
              className="gap-1.5 bg-amber-600 font-semibold text-white shadow-2xs hover:bg-amber-700 focus-visible:outline-amber-600 active:bg-amber-800"
              leadingIcon={<ArrowRightLeft className="size-4 shrink-0" aria-hidden="true" />}
            >
              {reviews.form.handoverConfirm}
            </Button>
          </div>
        )
      }
    >
      {isSuccess ? (
        <div className="flex flex-col items-center justify-center space-y-4 py-6 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-8 ring-emerald-500/10">
            <Check className="size-8" aria-hidden="true" />
          </div>
          <div className="space-y-1.5">
            <p className="text-ink-600 max-w-sm text-sm font-medium">
              Your draft comments have been preserved.
            </p>
          </div>
          <div className="flex items-center gap-2 pt-2 text-xs font-semibold text-ink-500">
            <Loader2 className="size-4 animate-spin text-violet-600" />
            <span>Returning to Reviewer Dashboard...</span>
          </div>
        </div>
      ) : hasSelectedRank ? (
        <div className="space-y-4 pt-1">
          <div className="space-y-1.5 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-amber-950">
                  Remove the selected rank before handing over
                </p>
                <p className="text-xs leading-relaxed text-amber-800">
                  You can still hand over this task with your comments and screenshots preserved.
                  The next reviewer will review the feedback and decide the final ranking.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-line bg-canvas/60 p-3.5">
            <span className="text-2xs font-bold tracking-wider text-ink-500 uppercase">
              Selected Rank
            </span>
            <div className="flex items-center gap-2 text-sm font-semibold text-ink-900">
              <span className="shrink-0 rounded bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                Rank {draft?.rank}
              </span>
              <span className="font-normal text-ink-400">-</span>
              <span className="text-ink-900">
                {draft?.rank ? RANK_DETAILS[draft.rank]?.subtitle : ''}
              </span>
            </div>
            <p className="pt-0.5 text-xs leading-relaxed text-ink-500">
              This rank will be cleared during handover. Your review comments and evidence will
              remain available as context for the next reviewer.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4 pt-1">
          {/* Task Context Summary */}
          <div className="text-ink-600 flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-line bg-canvas/70 px-4 py-2.5 text-xs">
            <div className="flex items-center gap-2">
              <span className="rounded border border-line/60 bg-surface px-1.5 py-0.5 font-mono font-semibold tracking-tight text-ink-900">
                {task.taskCode}
              </span>
              <span className="text-ink-300">•</span>
              <span className="font-medium text-ink-700">Round {task.reviewRound}</span>
            </div>
            <div className="flex items-center gap-1.5 text-ink-500">
              <span>Current reviewer:</span>
              <span className="text-ink-800 font-semibold">
                {textOr(task.reviewerName, 'Unassigned')}
              </span>
            </div>
          </div>

          {/* What Happens Next Section */}
          <div className="space-y-2 rounded-xl border border-line/60 bg-canvas/40 p-3.5">
            <p className="text-xs font-semibold tracking-wider text-ink-500 uppercase">
              {reviews.form.handoverWhatHappensNext}
            </p>
            <ul className="space-y-1.5 text-xs text-ink-700">
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
                <span>{reviews.form.handoverPoint1}</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
                <span>{reviews.form.handoverPoint2}</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
                <span>{reviews.form.handoverPoint3}</span>
              </li>
            </ul>
          </div>

          {/* Reason Field */}
          <Field
            label={reviews.form.handoverReasonLabel}
            hint={reviews.form.handoverReasonHint}
            required
            error={error}
          >
            <Textarea
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                if (error) setError(undefined);
              }}
              rows={3}
              className="min-h-[105px] text-sm leading-relaxed"
              placeholder={reviews.form.handoverReasonPlaceholder}
              aria-label={reviews.form.handoverReasonLabel}
            />
            <p className="mt-1.5 text-xs text-ink-500">{reviews.form.handoverReasonHelper}</p>
          </Field>

          {/* Cycle / Decision Reassurance */}
          <div className="flex items-center gap-2 rounded-lg bg-surface px-1 py-1 text-xs text-ink-500">
            <Info className="size-4 shrink-0 text-ink-400" aria-hidden="true" />
            <span>{reviews.form.handoverReassurance}</span>
          </div>
        </div>
      )}
    </Dialog>
  );
}
