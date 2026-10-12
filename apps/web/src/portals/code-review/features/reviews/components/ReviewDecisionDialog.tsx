import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, AlertTriangle, AlertCircle, ArrowLeft, Loader2 } from 'lucide-react';
import type { ReviewDecision, ReviewDraft } from '@sdp/contracts';
import { Button } from '@/components/ui/Button.tsx';
import { Dialog } from '@/components/ui/Dialog.tsx';
import { ROUTES } from '@/config/routes.ts';
import { cn } from '@/components/ui';
import common from '@/content/common.json';
import { getRankLabel } from '../domain/reviewRules.ts';

export interface ReviewDecisionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  decision: ReviewDecision | null;
  draft: ReviewDraft;
  reviewRound?: number | undefined;
  /** Legacy alias for reviewRound */
  reviewCycle?: number | undefined;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
  onSuccess?: ((decision: ReviewDecision) => void) | undefined;
}

export function ReviewDecisionDialog({
  open,
  decision,
  draft,
  reviewRound,
  reviewCycle,
  onConfirm,
  onClose,
  onSuccess,
}: ReviewDecisionDialogProps) {
  const activeRound = reviewRound ?? reviewCycle ?? 1;
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const submittingRef = useRef(false);
  const hasNavigatedRef = useRef(false);

  const comments = draft.comments ?? [];
  const totalScreenshots = comments.reduce((sum, c) => sum + (c.screenshots?.length ?? 0), 0);

  const rankLabel = getRankLabel(draft.rank);

  const isApprove = decision === 'Approved';

  const handleDirectNavigate = useCallback(() => {
    if (hasNavigatedRef.current) return;
    hasNavigatedRef.current = true;
    if (decision && onSuccess) {
      onSuccess(decision);
      return;
    }
    const bucket = decision === 'Approved' ? 'approved' : 'changesRequested';
    const statusParam = decision === 'Approved' ? 'Approved' : 'ChangesRequested';
    void navigate(
      `${ROUTES.reviewer.history}?status=${statusParam}&bucket=${bucket}&decision=${statusParam}`,
      { replace: true },
    );
  }, [navigate, decision, onSuccess]);

  useEffect(() => {
    if (!isSuccess) return;
    const timer = setTimeout(() => {
      handleDirectNavigate();
    }, 850);
    return () => clearTimeout(timer);
  }, [isSuccess, handleDirectNavigate]);

  const handleConfirm = async () => {
    if (submittingRef.current || isSubmitting || isSuccess) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await onConfirm();
      setIsSuccess(true);
    } catch (err: unknown) {
      submittingRef.current = false;
      setIsSubmitting(false);
      const errorMessage =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
            ? String(err.message)
            : common.errors.generic;
      setSubmitError(errorMessage);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (submittingRef.current || isSubmitting) {
      // Keep dialog stable during active submission
      return;
    }
    if (!next) {
      if (isSuccess) {
        handleDirectNavigate();
      } else {
        onClose();
      }
    }
  };

  if (!decision) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
      size="md"
      title={
        isSuccess
          ? isApprove
            ? 'Task Approved'
            : 'Changes Requested'
          : isApprove
            ? 'Approve this task?'
            : 'Request changes?'
      }
      subtitle={
        isSuccess
          ? undefined
          : isApprove
            ? 'This will complete the review and approve the task.'
            : 'The developer will receive your review feedback and the task will be returned for changes.'
      }
      icon={
        isSuccess ? null : isApprove ? (
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20">
            <CheckCircle2 className="size-5" aria-hidden="true" />
          </div>
        ) : (
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/20">
            <AlertTriangle className="size-5" aria-hidden="true" />
          </div>
        )
      }
      footer={
        isSuccess ? null : (
          <div className="flex w-full flex-wrap items-center justify-end gap-3 pt-1">
            <Button variant="secondary" disabled={isSubmitting} onClick={onClose}>
              {common.actions.cancel}
            </Button>

            {isApprove ? (
              <Button
                type="button"
                onClick={() => {
                  void handleConfirm();
                }}
                isLoading={isSubmitting}
                loadingLabel="Approving..."
                className="gap-1.5 bg-emerald-600 font-semibold text-white shadow-2xs hover:bg-emerald-700 focus-visible:outline-emerald-600 active:bg-emerald-800"
                leadingIcon={<CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />}
              >
                Approve Task
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => {
                  void handleConfirm();
                }}
                isLoading={isSubmitting}
                loadingLabel="Requesting Changes..."
                className="gap-1.5 bg-amber-600 font-semibold text-white shadow-2xs hover:bg-amber-700 focus-visible:outline-amber-600 active:bg-amber-800"
              >
                Request Changes
              </Button>
            )}
          </div>
        )
      }
    >
      {isSuccess ? (
        <div className="flex flex-col items-center space-y-3 py-6 text-center transition-opacity duration-200">
          <div
            className={cn(
              'flex size-14 scale-100 items-center justify-center rounded-full ring-8 transition-transform duration-300',
              isApprove
                ? 'bg-emerald-100 text-emerald-600 ring-emerald-50'
                : 'bg-amber-100 text-amber-600 ring-amber-50',
            )}
          >
            <CheckCircle2 className="size-8" aria-hidden="true" />
          </div>

          <p className="max-w-sm pt-1 text-sm font-medium text-ink-700">
            {isApprove
              ? 'The review was completed successfully.'
              : 'The developer has been notified of the required changes.'}
          </p>

          <p className="flex items-center justify-center gap-1.5 pt-1 text-xs text-ink-400">
            <Loader2 className="size-3.5 animate-spin text-ink-400" aria-hidden="true" />
            Redirecting to Review History...
          </p>

          <div className="pt-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleDirectNavigate}
              className="gap-1.5 font-medium shadow-2xs"
            >
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              View in Review History
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4 pt-1">
          {submitError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-600" aria-hidden="true" />
              <div className="min-w-0 flex-1">{submitError}</div>
            </div>
          )}

          <div className="space-y-3 rounded-xl border border-line bg-canvas/60 p-4">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-ink-500">Review Result</span>
              <span
                className={cn(
                  'font-semibold',
                  isApprove
                    ? 'text-emerald-700'
                    : 'text-amber-700',
                )}
              >
                {rankLabel}
              </span>
            </div>

            <div className="flex items-center justify-between border-t border-line/60 pt-2.5 text-xs">
              <span className="font-medium text-ink-500">Review Comments</span>
              <span className="font-semibold text-ink-900">{comments.length}</span>
            </div>

            {!isApprove && (
              <div className="flex items-center justify-between border-t border-line/60 pt-2.5 text-xs">
                <span className="font-medium text-ink-500">Supporting Screenshots</span>
                <span className="font-semibold text-ink-900">{totalScreenshots}</span>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-line/60 pt-2.5 text-xs">
              <span className="font-medium text-ink-500">Round</span>
              <span className="font-semibold text-ink-900">Round {activeRound}</span>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}
