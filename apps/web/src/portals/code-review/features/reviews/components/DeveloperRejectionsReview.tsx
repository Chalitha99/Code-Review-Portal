import { useState } from 'react';
import { CheckCircle2, MessageSquareWarning, XCircle } from 'lucide-react';
import type { IssueResponseRecord, ReviewHistoryEntry, ReviewScreenshot } from '@sdp/contracts';
import { Card, CardBody, CardHeader } from '@/components/ui/Card.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { Tag } from '@/portals/code-review/components/badges.tsx';
import { Alert } from '@/components/ui/Alert.tsx';
import { Field } from '@/components/ui/Field.tsx';
import { Textarea } from '@/components/ui/controls.tsx';
import { ConfirmDialog } from '@/components/common/ConfirmDialog.tsx';
import { ScreenshotPreviewCard } from '@/portals/code-review/components/ScreenshotPreviewCard.tsx';
import { ImageLightboxModal } from '@/portals/code-review/components/ImageLightboxModal.tsx';
import { textOr } from '@/lib/formatters.ts';
import { useFocusOnMount } from '@/hooks/useFocusOnMount.ts';

export interface DeveloperRejectionsReviewProps {
  taskId: string;
  history: readonly ReviewHistoryEntry[];
  responses: readonly IssueResponseRecord[];
  activeRound?: number | undefined;
  /** Legacy alias for activeRound */
  activeCycle?: number | undefined;
  onUpdateVerdict: (
    responseId: string,
    verdict: 'Accepted' | 'Overruled' | 'Pending',
    reviewerComment?: string | null,
  ) => void;
  onDraftChange?: ((responseId: string, isDrafting: boolean) => void) | undefined;
  isUpdatingVerdict?: boolean;
  readOnly?: boolean;
}

interface NegativeDraftState {
  comment: string;
  initialComment: string;
  touched: boolean;
  error?: string | undefined;
}

export function DeveloperRejectionsReview({
  taskId,
  history,
  responses,
  activeRound,
  activeCycle,
  onUpdateVerdict,
  onDraftChange,
  isUpdatingVerdict = false,
  readOnly = false,
}: DeveloperRejectionsReviewProps) {
  const focusOnMount = useFocusOnMount<HTMLTextAreaElement>();
  const [lightboxScreenshot, setLightboxScreenshot] = useState<ReviewScreenshot | null>(null);
  const [lightboxShots, setLightboxShots] = useState<readonly ReviewScreenshot[]>([]);
  const [negativeDrafts, setNegativeDrafts] = useState<Record<string, NegativeDraftState>>({});
  const [confirmDiscard, setConfirmDiscard] = useState<{
    responseId: string;
    targetAction: () => void;
  } | null>(null);

  // Find latest completed review with decision (the round being re-reviewed)
  const completedReviews = history.filter((entry) => entry.decision !== null);
  const lastReview = completedReviews[0] ?? null;
  if (!lastReview) return null;

  // Resolve target round for adjudication:
  // Prefer explicit activeRound/activeCycle or the highest response reviewRound that exceeds lastReview.reviewRound,
  // falling back cleanly to lastReview.reviewRound for legacy single-round test fixtures.
  const targetRound =
    activeRound ??
    activeCycle ??
    (responses.some((r) => r.reviewRound > lastReview.reviewRound)
      ? Math.max(...responses.map((r) => r.reviewRound))
      : lastReview.reviewRound);

  const hasTargetRoundResponses = responses.some((r) => r.reviewRound === targetRound);
  const roundResponses = hasTargetRoundResponses
    ? responses.filter((r) => r.reviewRound === targetRound)
    : responses.filter((r) => r.reviewRound === lastReview.reviewRound);

  if (roundResponses.length === 0) return null;

  const rejectedResponses = roundResponses.filter((r) => r.kind === 'Rejected');
  const allRejectionsAccepted =
    rejectedResponses.length > 0 &&
    rejectedResponses.every((r) => r.verdict === 'Accepted') &&
    roundResponses.filter((r) => r.kind === 'Resolved').length === 0;

  const hasOverruled = roundResponses.some((r) => r.verdict === 'Overruled');
  const hasPending = roundResponses.some((r) => !r.verdict || r.verdict === 'Pending');

  // Collect all comments across history to support multi-round findings
  const allHistoryComments = new Map<
    string,
    { text: string; screenshots: ReviewScreenshot[]; round: number }
  >();
  for (const entry of history) {
    for (const c of entry.comments ?? []) {
      if (!allHistoryComments.has(c.id)) {
        allHistoryComments.set(c.id, {
          text: c.text,
          screenshots: c.screenshots ?? [],
          round: entry.reviewRound,
        });
      }
    }
  }

  // Derive feedback items from lastReview comments + any roundResponses referencing past comments
  const items: {
    id: string;
    label: string;
    text: string;
    screenshots: ReviewScreenshot[];
    response?: IssueResponseRecord | undefined;
  }[] = [];

  const addedCommentIds = new Set<string>();

  if (lastReview.comments && lastReview.comments.length > 0) {
    lastReview.comments.forEach((c, idx) => {
      addedCommentIds.add(c.id);
      const resp = roundResponses.find((r) => r.commentId === c.id);
      items.push({
        id: c.id,
        label: `Review Comment #${idx + 1}`,
        text: c.text,
        screenshots: c.screenshots ?? [],
        response: resp,
      });
    });
  }

  // Include any roundResponses whose comment originated in a prior round
  roundResponses.forEach((resp) => {
    if (resp.commentId && !addedCommentIds.has(resp.commentId)) {
      addedCommentIds.add(resp.commentId);
      const prior = allHistoryComments.get(resp.commentId);
      items.push({
        id: resp.commentId,
        label: `Review Comment #${items.length + 1} (Follow-Up)`,
        text: prior?.text ?? 'Review comment follow-up',
        screenshots: prior?.screenshots ?? [],
        response: resp,
      });
    }
  });

  // Legacy fallback for screenshot-based findings
  if (items.length === 0) {
    (lastReview.screenshots ?? []).forEach((shot) => {
      const resp = roundResponses.find((r) => r.screenshotId === shot.id);
      items.push({
        id: shot.id,
        label: shot.fileName,
        text: shot.comment || 'Screenshot finding',
        screenshots: [shot],
        response: resp,
      });
    });
  }

  // Only render if there are items with developer responses
  const itemsWithResponse = items.filter((i) => i.response !== undefined);
  if (itemsWithResponse.length === 0) return null;

  function handleStartNegativeDraft(responseId: string, initialComment: string) {
    setNegativeDrafts((prev) => ({
      ...prev,
      [responseId]: {
        comment: initialComment,
        initialComment,
        touched: false,
        error: undefined,
      },
    }));
    onDraftChange?.(responseId, true);
  }

  function handleCancelNegativeDraft(responseId: string, force = false) {
    const draft = negativeDrafts[responseId];
    if (!force && draft) {
      const isDirty =
        draft.comment.trim() !== draft.initialComment.trim() && draft.comment.trim().length > 0;
      if (isDirty) {
        setConfirmDiscard({
          responseId,
          targetAction: () => handleCancelNegativeDraft(responseId, true),
        });
        return;
      }
    }

    setNegativeDrafts((prev) => {
      const copy = { ...prev };
      delete copy[responseId];
      return copy;
    });
    onDraftChange?.(responseId, false);
  }

  function handleSaveNegativeDraft(responseId: string) {
    const draft = negativeDrafts[responseId];
    const text = draft?.comment?.trim() ?? '';
    if (!text) {
      setNegativeDrafts((prev) => ({
        ...prev,
        [responseId]: {
          comment: prev[responseId]?.comment ?? '',
          initialComment: prev[responseId]?.initialComment ?? '',
          touched: true,
          error: 'An explanation is required when not accepting or not resolving a finding.',
        },
      }));
      return;
    }

    onUpdateVerdict(responseId, 'Overruled', text);
    handleCancelNegativeDraft(responseId, true);
  }

  function executePositiveAction(resp: IssueResponseRecord) {
    if (resp.verdict === 'Accepted') {
      // Toggle off: second click resets back to Pending
      onUpdateVerdict(resp.id, 'Pending', null);
    } else {
      // First click selects Accepted
      onUpdateVerdict(resp.id, 'Accepted', null);
    }
  }

  function handlePositiveClick(resp: IssueResponseRecord) {
    const draft = negativeDrafts[resp.id];
    if (draft) {
      const isDirty =
        draft.comment.trim() !== draft.initialComment.trim() && draft.comment.trim().length > 0;
      if (isDirty) {
        setConfirmDiscard({
          responseId: resp.id,
          targetAction: () => {
            handleCancelNegativeDraft(resp.id, true);
            executePositiveAction(resp);
          },
        });
        return;
      }
      handleCancelNegativeDraft(resp.id, true);
    }
    executePositiveAction(resp);
  }

  function handleNegativeClick(resp: IssueResponseRecord) {
    const isDrafting = Boolean(negativeDrafts[resp.id]);
    if (isDrafting) {
      handleCancelNegativeDraft(resp.id);
      return;
    }

    if (resp.verdict === 'Overruled') {
      // Negative saved verdicts must NOT be removed accidentally by button clicking.
      // Re-open editor with existing explanation so user can edit if desired.
      handleStartNegativeDraft(resp.id, resp.reviewerComment ?? '');
      return;
    }

    // Open explanation editor
    handleStartNegativeDraft(resp.id, resp.reviewerComment ?? '');
  }

  return (
    <>
      <Card
        collapsible
        defaultExpanded={hasPending}
        resetKey={`${taskId}:${roundResponses.length > 0 ? 'responses' : 'empty'}`}
        summary={`${itemsWithResponse.length} ${itemsWithResponse.length === 1 ? 'response' : 'responses'} · ${roundResponses.filter((response) => !response.verdict || response.verdict === 'Pending').length} pending adjudication`}
        className="border-amber-200/80 bg-gradient-to-b from-amber-50/20 via-surface to-surface shadow-card"
      >
        <CardHeader
          title="Developer Response & Rejection Review"
          description="Inspect developer responses to prior round feedback. Adjudicate all resolved findings and developer rejections before deciding."
          icon={<MessageSquareWarning className="size-4 text-amber-600" />}
        />

        <CardBody className="space-y-4 pt-3">
          {allRejectionsAccepted ? (
            <Alert
              tone="success"
              title="All rejections accepted. Zero developer corrections were required. Task can be approved with cycle reduced by 1."
            />
          ) : hasOverruled ? (
            <Alert
              tone="warning"
              title="One or more developer responses are marked Not Resolved or Not Accepted. Approval (Rank 1) is blocked. Select Rank 2 or 3 to Request Changes."
            />
          ) : hasPending ? (
            <Alert
              tone="info"
              title="Pending adjudication: please verify all resolved findings and adjudicate all rejections below before deciding."
            />
          ) : (
            <Alert
              tone="success"
              title="All developer responses have been adjudicated. Rank 1 / Approve is available."
            />
          )}

          <ul className="space-y-3">
            {itemsWithResponse.map((item) => {
              const resp = item.response!;
              const isRejected = resp.kind === 'Rejected';
              const isResolved = resp.kind === 'Resolved';
              const isDraftingNegative = Boolean(negativeDrafts[resp.id]);
              const draftState = negativeDrafts[resp.id];

              return (
                <li
                  key={item.id}
                  className="space-y-3 rounded-xl border border-line bg-surface p-4 shadow-2xs"
                >
                  {/* Top Bar: Item Label & Response Badges */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold tracking-wider text-ink-500 uppercase">
                        {item.label}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {isResolved ? (
                        <Tag className="bg-emerald-100 font-bold text-emerald-800">
                          Developer: Resolved
                        </Tag>
                      ) : (
                        <Tag className="bg-amber-100 font-bold text-amber-900">
                          Developer: Rejected
                        </Tag>
                      )}

                      {/* Adjudication Verdict Badge */}
                      {isDraftingNegative ? (
                        <Tag className="border-rose-200 bg-rose-50 font-semibold text-rose-800">
                          Drafting Adjudication
                        </Tag>
                      ) : (
                        <>
                          {isResolved && (
                            <Tag
                              className={
                                resp.verdict === 'Accepted'
                                  ? 'bg-emerald-100 font-bold text-emerald-800'
                                  : resp.verdict === 'Overruled'
                                    ? 'bg-rose-100 font-bold text-rose-800'
                                    : 'bg-amber-100 font-bold text-amber-800'
                              }
                            >
                              {resp.verdict === 'Accepted'
                                ? 'Resolution Verified'
                                : resp.verdict === 'Overruled'
                                  ? 'Not Resolved'
                                  : 'Pending Verification'}
                            </Tag>
                          )}

                          {isRejected && (
                            <Tag
                              className={
                                resp.verdict === 'Accepted'
                                  ? 'bg-emerald-100 font-bold text-emerald-800'
                                  : resp.verdict === 'Overruled'
                                    ? 'bg-rose-100 font-bold text-rose-800'
                                    : 'bg-amber-100 font-bold text-amber-800'
                              }
                            >
                              {resp.verdict === 'Accepted'
                                ? 'Rejection Accepted'
                                : resp.verdict === 'Overruled'
                                  ? 'Rejection Not Accepted'
                                  : 'Pending Adjudication'}
                            </Tag>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Original Reviewer Comment Text */}
                  <div>
                    <p className="mb-1 text-xs font-bold tracking-wider text-ink-500 uppercase">
                      Original Reviewer Comment:
                    </p>
                    <p className="text-ink-800 text-sm leading-relaxed whitespace-pre-wrap">
                      {item.text}
                    </p>
                  </div>

                  {/* Screenshots if attached */}
                  {item.screenshots.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <p className="text-2xs font-bold tracking-wider text-ink-500 uppercase">
                        Attached Evidence ({item.screenshots.length})
                      </p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {item.screenshots.map((shot) => (
                          <ScreenshotPreviewCard
                            key={shot.id}
                            shot={shot}
                            readOnly={true}
                            onPreview={(s) => {
                              setLightboxScreenshot(s);
                              setLightboxShots(item.screenshots);
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Developer Response Details */}
                  {isResolved ? (
                    <div className="rounded-lg border border-emerald-200/60 bg-emerald-50/30 p-2.5">
                      <p className="text-xs font-semibold text-emerald-900">
                        Marked as resolved by developer. Please verify the fix during re-review.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1.5 rounded-lg border border-amber-200/60 bg-amber-50/30 p-3">
                      <p className="text-xs font-bold tracking-wider text-amber-900 uppercase">
                        Developer Rejection Reason:
                      </p>
                      <p className="text-ink-800 text-sm leading-relaxed whitespace-pre-wrap">
                        {textOr(resp.rejectionReason, 'No reason provided.')}
                      </p>
                    </div>
                  )}

                  {/* Saved Negative Verdict Summary Card */}
                  {!isDraftingNegative && resp.verdict === 'Overruled' && (
                    <div className="bg-surface-raised/40 mt-2 space-y-1.5 rounded-lg border border-line/80 p-3 text-xs shadow-2xs">
                      <div className="flex items-center justify-between gap-2 border-b border-line/50 pb-1.5">
                        <span className="text-2xs font-bold tracking-wider text-ink-700 uppercase">
                          Reviewer Follow-up Explanation (
                          {isResolved ? 'Not Resolved' : 'Rejection Not Accepted'})
                        </span>
                        {!readOnly && (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={isUpdatingVerdict}
                              onClick={() =>
                                handleStartNegativeDraft(resp.id, resp.reviewerComment ?? '')
                              }
                              className="text-2xs text-accent-600 hover:text-accent-700 cursor-pointer font-semibold hover:underline disabled:opacity-50"
                            >
                              Change explanation
                            </button>
                            <span className="text-ink-300">·</span>
                            <button
                              type="button"
                              disabled={isUpdatingVerdict}
                              onClick={() => {
                                handleCancelNegativeDraft(resp.id, true);
                                onUpdateVerdict(resp.id, 'Pending', null);
                              }}
                              className="text-2xs cursor-pointer font-semibold text-rose-600 hover:text-rose-700 hover:underline disabled:opacity-50"
                            >
                              Remove verdict
                            </button>
                          </div>
                        )}
                      </div>
                      <p className="text-ink-800 text-sm leading-relaxed whitespace-pre-wrap">
                        {textOr(resp.reviewerComment, 'No explanation provided.')}
                      </p>
                    </div>
                  )}

                  {/* Reviewer Verdict Action Controls */}
                  {!readOnly && (
                    <div className="space-y-3 border-t border-line/60 pt-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {isResolved ? (
                          <>
                            <Button
                              size="sm"
                              variant={
                                !isDraftingNegative && resp.verdict === 'Accepted'
                                  ? 'success'
                                  : 'secondary'
                              }
                              disabled={isUpdatingVerdict}
                              onClick={() => handlePositiveClick(resp)}
                              className="gap-1.5 text-xs font-semibold"
                            >
                              <CheckCircle2 className="size-3.5" aria-hidden="true" />
                              Verify Resolved
                            </Button>

                            <Button
                              size="sm"
                              variant={
                                isDraftingNegative || resp.verdict === 'Overruled'
                                  ? 'danger'
                                  : 'secondary'
                              }
                              disabled={isUpdatingVerdict}
                              onClick={() => handleNegativeClick(resp)}
                              className="gap-1.5 text-xs font-semibold"
                            >
                              <XCircle className="size-3.5" aria-hidden="true" />
                              Not Resolved
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant={
                                !isDraftingNegative && resp.verdict === 'Accepted'
                                  ? 'success'
                                  : 'secondary'
                              }
                              disabled={isUpdatingVerdict}
                              onClick={() => handlePositiveClick(resp)}
                              className="gap-1.5 text-xs font-semibold"
                            >
                              <CheckCircle2 className="size-3.5" aria-hidden="true" />
                              Accept Rejection
                            </Button>

                            <Button
                              size="sm"
                              variant={
                                isDraftingNegative || resp.verdict === 'Overruled'
                                  ? 'danger'
                                  : 'secondary'
                              }
                              disabled={isUpdatingVerdict}
                              onClick={() => handleNegativeClick(resp)}
                              className="gap-1.5 text-xs font-semibold"
                            >
                              <XCircle className="size-3.5" aria-hidden="true" />
                              Do Not Accept
                            </Button>
                          </>
                        )}
                      </div>

                      {/* Negative Verdict Explanation Input */}
                      {isDraftingNegative && (
                        <div className="space-y-2.5 rounded-lg border border-rose-200/80 bg-rose-50/30 p-3">
                          <Field
                            label="Reviewer Follow-up Explanation (Required)"
                            required
                            error={draftState?.error}
                          >
                            <Textarea
                              aria-label="Reviewer follow-up explanation"
                              value={draftState?.comment ?? ''}
                              onChange={(event) => {
                                const val = event.target.value;
                                setNegativeDrafts((prev) => ({
                                  ...prev,
                                  [resp.id]: {
                                    comment: val,
                                    initialComment: prev[resp.id]?.initialComment ?? '',
                                    touched: prev[resp.id]?.touched ?? false,
                                    error:
                                      prev[resp.id]?.touched && val.trim() === ''
                                        ? 'An explanation is required when not accepting or not resolving a finding.'
                                        : undefined,
                                  },
                                }));
                              }}
                              placeholder={
                                isResolved
                                  ? 'Explain why this finding is not resolved...'
                                  : 'Explain why this rejection is not accepted...'
                              }
                              disabled={isUpdatingVerdict}
                              rows={2}
                              className="text-sm"
                              ref={focusOnMount}
                            />
                          </Field>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="danger"
                              className="text-xs font-semibold"
                              disabled={isUpdatingVerdict}
                              onClick={() => handleSaveNegativeDraft(resp.id)}
                            >
                              Save Verdict
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="text-xs font-semibold"
                              disabled={isUpdatingVerdict}
                              onClick={() => handleCancelNegativeDraft(resp.id)}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>

      {/* Unsaved Draft Protection Discard Confirmation */}
      <ConfirmDialog
        open={confirmDiscard !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDiscard(null);
        }}
        title="Discard current explanation?"
        description="Your unsaved explanation will be lost."
        confirmLabel="Discard"
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={() => {
          if (confirmDiscard) {
            confirmDiscard.targetAction();
            setConfirmDiscard(null);
          }
        }}
      />

      {/* Image Preview Modal */}
      <ImageLightboxModal
        shot={lightboxScreenshot}
        shots={lightboxShots}
        onClose={() => {
          setLightboxScreenshot(null);
          setLightboxShots([]);
        }}
        onSelectShot={(shot) => setLightboxScreenshot(shot)}
      />
    </>
  );
}
