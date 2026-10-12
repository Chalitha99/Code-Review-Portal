import type { ReactNode } from 'react';
import type { TaskListItem } from '@sdp/contracts';
import { CustomerChip, PriorityPill } from '@/portals/code-review/components/badges.tsx';
import {
  DateCell,
  MonoId,
  OptionalCell,
  RowArrowAction,
  StatusCell,
  TitleCell,
} from '@/portals/code-review/components/cells.tsx';
import { columnHelper, type ColumnList } from '@/components/common/dataTableColumns.ts';
import { formatDate, interpolate } from '@/lib/formatters.ts';
import tasks from '@/content/tasks.json';

/**
 * Column definitions for the task grids.
 *
 * A factory rather than a module constant because each grid differs only in its
 * trailing action and in whether it names the developer or the reviewer — the
 * six grids in the product are the same nine cells in different combinations,
 * and duplicating them is how columns drift apart.
 *
 * Each column is defined as its own `const` and the list assembled afterwards.
 * Inlining them into one conditional array literal collapses TanStack's tuple
 * inference and every `cell` callback silently receives `any`, which typecheck
 * accepts and lint only catches because `no-unsafe-assignment` is on.
 */

const helper = columnHelper<TaskListItem>();
const labels = tasks.list.columns;

const taskCodeColumn = helper.accessor('taskCode', {
  header: labels.taskId,
  meta: {
    headerClassName: 'w-[120px] min-w-[110px] whitespace-nowrap',
    cellClassName: 'w-[120px] min-w-[110px] whitespace-nowrap',
  },
  cell: (context) => <MonoId value={context.getValue()} />,
});

const handoverTaskCodeColumn = helper.accessor('taskCode', {
  header: labels.taskId,
  cell: (context) => {
    const task = context.row.original;
    return (
      <div className="flex flex-col items-start gap-1">
        <MonoId value={context.getValue()} />
        {task.handedOverByName ? (
          <span className="text-[10px] text-status-handover italic">
            Prev. {task.handedOverByName.trim().split(/\s+/)[0] ?? task.handedOverByName}
          </span>
        ) : null}
      </div>
    );
  },
});

const titleColumn = helper.accessor('title', {
  header: labels.title,
  meta: {
    headerClassName: 'min-w-[180px]',
    cellClassName: 'min-w-[180px]',
  },
  cell: (context) => <TitleCell title={context.getValue()} />,
});

const compactTitleColumn = helper.accessor('title', {
  header: labels.title,
  cell: (context) => (
    <TitleCell title={context.getValue()} className="!w-[200px] !max-w-[200px]" />
  ),
});

const crimIdColumn = helper.accessor('crimId', {
  header: labels.crimId,
  meta: {
    headerClassName: 'w-[110px] min-w-[100px] whitespace-nowrap',
    cellClassName: 'w-[110px] min-w-[100px] whitespace-nowrap',
  },
  cell: (context) => <MonoId value={context.getValue()} />,
});

const customerColumn = helper.accessor('customerName', {
  header: labels.customer,
  meta: {
    headerClassName: 'w-[130px] min-w-[120px] whitespace-nowrap',
    cellClassName: 'w-[130px] min-w-[120px] whitespace-nowrap',
  },
  cell: (context) => (
    <CustomerChip
      name={context.getValue()}
      color={context.row.original.customerColor}
      variant="inline"
    />
  ),
});

const developerColumn = helper.accessor('developerName', {
  header: labels.developer,
  meta: {
    headerClassName: 'min-w-[130px] whitespace-nowrap',
    cellClassName: 'min-w-[130px] whitespace-nowrap',
  },
  cell: (context) => <span className="text-sm whitespace-nowrap">{context.getValue()}</span>,
});

const reviewerColumn = helper.accessor('reviewerName', {
  header: labels.reviewer,
  // "Unassigned" rather than the usual em-dash: in this column an empty value
  // is a state someone acts on, not missing data, and screen 01 names it.
  meta: {
    headerClassName: 'min-w-[130px] whitespace-nowrap',
    cellClassName: 'min-w-[130px] whitespace-nowrap',
  },
  cell: (context) => (
    <span className="whitespace-nowrap">
      <OptionalCell value={context.getValue()} fallback={labels.unassigned} />
    </span>
  ),
});

const statusColumn = helper.accessor('status', {
  header: labels.status,
  meta: {
    headerClassName: 'w-[160px] min-w-[150px] whitespace-nowrap',
    cellClassName: 'w-[160px] min-w-[150px]',
  },
  cell: (context) => (
    <StatusCell status={context.getValue()} cycle={context.row.original.reviewRound} />
  ),
});

const priorityColumn = helper.accessor('priority', {
  header: labels.priority,
  meta: {
    headerClassName: 'w-[100px] min-w-[95px] whitespace-nowrap',
    cellClassName: 'w-[100px] min-w-[95px] whitespace-nowrap',
  },
  cell: (context) => <PriorityPill priority={context.getValue()} />,
});

const cycleColumn = helper.accessor('countedCycle', {
  header: labels.countedCycle ?? labels.cycle,
  meta: {
    headerClassName: 'w-[150px] min-w-[145px] whitespace-nowrap',
    cellClassName: 'w-[150px] min-w-[145px] whitespace-nowrap',
  },
  cell: (context) => (
    <span className="text-sm font-medium tabular-nums whitespace-nowrap">Cycle {context.getValue()}</span>
  ),
});

const createdColumn = helper.accessor('createdAt', {
  header: labels.created,
  meta: {
    headerClassName: 'w-[125px] min-w-[120px] whitespace-nowrap',
    cellClassName: 'w-[125px] min-w-[120px] whitespace-nowrap',
  },
  cell: (context) => <DateCell>{formatDate(context.getValue())}</DateCell>,
});

export interface TaskColumnOptions {
  /** Trailing action cell. Omit for a read-only grid. */
  renderAction?: ((task: TaskListItem) => ReactNode) | undefined;
  /** Show who the task is assigned to — reviewer queues need it, My Tasks does not. */
  showReviewer?: boolean | undefined;
  showDeveloper?: boolean | undefined;
  /**
   * Off for the admin grid (screen 01), which already carries ten columns and
   * draws developer and reviewer instead. Priority is a developer's own triage
   * signal; the admin filters by status and people.
   */
  showPriority?: boolean | undefined;
  /** Identify tasks that have previously been handed over. */
  showHandover?: boolean | undefined;
  /** Keep Title close to CRIM ID in Reviewer task queues. */
  compactIdentityColumns?: boolean | undefined;
}

export function buildTaskColumns(options: TaskColumnOptions = {}): ColumnList<TaskListItem> {
  const {
    renderAction,
    showReviewer = false,
    showDeveloper = false,
    showPriority = true,
    showHandover = false,
    compactIdentityColumns = false,
  } = options;

  const columns: ColumnList<TaskListItem> = [
    showHandover ? handoverTaskCodeColumn : taskCodeColumn,
    compactIdentityColumns ? compactTitleColumn : titleColumn,
    crimIdColumn,
    customerColumn,
  ];

  if (showDeveloper) columns.push(developerColumn);
  if (showReviewer) columns.push(reviewerColumn);

  columns.push(statusColumn);
  if (showPriority) columns.push(priorityColumn);
  columns.push(cycleColumn, createdColumn);

  if (renderAction) {
    columns.push(
      helper.display({
        id: 'actions',
        header: '',
        meta: {
          headerClassName: 'w-[100px] min-w-[90px] whitespace-nowrap',
          cellClassName: 'w-[100px] min-w-[90px] whitespace-nowrap',
        },
        cell: (context) => renderAction(context.row.original),
      }),
    );
  }

  return columns;
}

/** The trailing view action used by My Tasks and the reviewer queues. */
export function taskArrowAction(
  task: TaskListItem,
  onOpen: () => void,
  text: string = tasks.list.viewTask,
) {
  return (
    <RowArrowAction
      label={interpolate(tasks.list.openTask, { taskCode: task.taskCode })}
      onClick={onOpen}
      text={text}
    />
  );
}

export const taskViewAction = taskArrowAction;
