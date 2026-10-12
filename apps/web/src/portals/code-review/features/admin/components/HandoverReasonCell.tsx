import { useState } from 'react';
import type { IsoDateTime } from '@sdp/contracts';
import { Button } from '@/components/ui/Button.tsx';
import { Dialog } from '@/components/ui/Dialog.tsx';
import common from '@/content/common.json';
import { formatDateTime } from '@/lib/formatters.ts';

/** A compact table preview with the full reviewer-provided reason on demand. */
export function HandoverReasonCell({
  reason,
  fromReviewerName,
  raisedAt,
}: {
  reason: string | null | undefined;
  fromReviewerName: string | null | undefined;
  raisedAt: IsoDateTime;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const value = reason?.trim() ?? '';

  if (value === '') return <span className="text-sm text-ink-400">—</span>;

  return (
    <>
      <div className="w-72 max-w-72">
        <p className="line-clamp-2 overflow-hidden text-sm leading-5 break-words text-ink-700">
          {value}
        </p>
        <button
          type="button"
          onClick={() => {
            setIsOpen(true);
          }}
          className="mt-1 rounded text-xs font-semibold text-brand-blue-600 transition-colors hover:text-brand-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
        >
          View reason
        </button>
      </div>

      <Dialog
        open={isOpen}
        onOpenChange={setIsOpen}
        title="Handover Reason"
        size="md"
        footer={
          <Button
            variant="secondary"
            onClick={() => {
              setIsOpen(false);
            }}
          >
            {common.actions.close}
          </Button>
        }
      >
        <div className="space-y-5">
          <p className="text-ink-800 text-sm leading-6 break-words whitespace-pre-wrap">{value}</p>
          <dl className="grid gap-3 rounded-lg bg-canvas/70 p-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-ink-500">Handed over by</dt>
              <dd className="text-ink-800 mt-0.5 font-semibold">{fromReviewerName ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-ink-500">Raised</dt>
              <dd className="text-ink-800 mt-0.5 font-semibold">{formatDateTime(raisedAt)}</dd>
            </div>
          </dl>
        </div>
      </Dialog>
    </>
  );
}
