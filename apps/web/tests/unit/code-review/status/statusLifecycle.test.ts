import { describe, expect, it } from 'vitest';
import {
  TASK_EVENT_KINDS,
  TASK_STATUSES,
  TASK_STATUS_TRANSITIONS,
  TERMINAL_TASK_STATUSES,
  taskEventKindSchema,
  taskStatusSchema,
  type TaskStatus,
} from '@sdp/contracts';
import { canTransition, isTerminalTask, nextStatuses } from '@/lib/taskPolicy.ts';
import { readTaskListFilters } from '@/portals/code-review/components/taskListNavigation.ts';
import { ALL } from '@/portals/code-review/components/taskFilters.ts';

/**
 * The Code Review Portal lifecycle. Matches the source project except the
 * destination contract's Draft → Cancelled edge, which `canCancelTask` never offers.
 */
const EXPECTED_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  Draft: ['Submitted', 'Cancelled'],
  Submitted: ['InReview', 'Cancelled'],
  InReview: ['Approved', 'ChangesRequested', 'Cancelled'],
  ChangesRequested: ['ReSubmitted', 'Cancelled'],
  ReSubmitted: ['InReview', 'Cancelled'],
  Approved: [],
  Cancelled: [],
};

describe('task status lifecycle', () => {
  it('declares exactly the Code Review statuses', () => {
    expect([...TASK_STATUSES].sort()).toEqual(Object.keys(EXPECTED_TRANSITIONS).sort());
  });

  it.each(Object.entries(EXPECTED_TRANSITIONS))(
    '%s allows only its declared next statuses',
    (from, to) => {
      expect(nextStatuses(from as TaskStatus)).toEqual(to);
      expect(TASK_STATUS_TRANSITIONS[from as TaskStatus]).toEqual(to);
    },
  );

  it('accepts every declared edge and rejects every undeclared one', () => {
    for (const from of TASK_STATUSES) {
      for (const to of TASK_STATUSES) {
        expect(canTransition(from, to)).toBe(EXPECTED_TRANSITIONS[from].includes(to));
      }
    }
  });

  it('treats Approved and Cancelled as the only terminal statuses', () => {
    expect([...TERMINAL_TASK_STATUSES].sort()).toEqual(['Approved', 'Cancelled']);
    expect(TASK_STATUSES.filter((status) => isTerminalTask(status)).sort()).toEqual([
      'Approved',
      'Cancelled',
    ]);
  });
});

describe('Delivered status removal', () => {
  it('is not a valid task status or event kind', () => {
    expect(taskStatusSchema.safeParse('Delivered').success).toBe(false);
    expect(taskEventKindSchema.safeParse('Delivered').success).toBe(false);
    expect(TASK_EVENT_KINDS).not.toContain('Delivered');
  });

  it('ignores a ?status=Delivered deep link instead of applying an impossible filter', () => {
    expect(readTaskListFilters(new URLSearchParams('status=Delivered')).status).toBe(ALL);
    expect(readTaskListFilters(new URLSearchParams('status=Approved')).status).toBe('Approved');
  });
});
