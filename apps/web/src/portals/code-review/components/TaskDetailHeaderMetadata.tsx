import type { TaskStatus } from '@sdp/contracts';
import { StatusBadge } from '@/portals/code-review/components/badges.tsx';
import { MonoId } from '@/portals/code-review/components/cells.tsx';

/**
 * The compact context row below a task-detail title.
 *
 * Version, priority, people, and review-cycle accounting belong in Task
 * Information. This row preserves a quick scan of identity, status, and one
 * optional workflow hint without repeating that card.
 */
export function TaskDetailHeaderMetadata({
  taskCode,
  status,
  workflowContext,
}: {
  taskCode: string;
  status: TaskStatus;
  workflowContext?: string | undefined;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
      <MonoId value={taskCode} className="font-semibold text-ink-500" />
      <StatusBadge status={status} />
      {workflowContext ? <span className="font-medium text-ink-500">{workflowContext}</span> : null}
    </div>
  );
}
