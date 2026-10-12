import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  CHECKLIST_ANSWERS,
  PRIORITIES,
  type ChecklistAnswer,
  type Priority,
  type TaskTypeId,
} from '@sdp/contracts';

/**
 * Client state for the New Review Task wizard (screens 22–25).
 *
 * Zustand rather than component state because the draft spans four routes and a
 * refresh mid-wizard must not lose it. `sessionStorage`, not `localStorage`: an
 * abandoned draft should not reappear next week in a different tab as if it were
 * work in progress.
 *
 * The store holds only what the user has typed. Every *rule* about that data —
 * whether a step may be left, whether the checklist is complete — lives in
 * `domain/`, so the store stays a dumb container and the rules stay testable
 * without mounting anything.
 */

const STORAGE_KEY = 'sdp.taskDraft';

/** An answer in progress: the id and the choice, nothing else. */
export interface DraftAnswer {
  questionId: string;
  answer: ChecklistAnswer;
}

export interface TaskDraftState {
  /** Set once the draft has been persisted server-side, so edits go to PATCH. */
  taskId: string | null;
  /** Human-facing id (`AIM-004`), issued by the server with the task. */
  taskCode: string | null;
  createdAt: string | null;
  submittedAt: string | null;

  customerId: string;
  crimId: string;
  version: string;
  priority: Priority;

  taskTypeIds: TaskTypeId[];
  /** Draft answers carry ids only; the server snapshots the wording on save. */
  answers: DraftAnswer[];
  remarks: string;
  /** Optional note the developer writes for the reviewer (screen 24). */
  noteToReviewer: string;

  setDetails: (
    details: Partial<Pick<TaskDraftState, 'customerId' | 'crimId' | 'version' | 'priority'>>,
  ) => void;
  setTaskId: (
    taskId: string,
    taskCode: string,
    createdAt?: string | null,
    submittedAt?: string | null,
  ) => void;
  toggleTaskType: (taskTypeId: TaskTypeId) => void;
  setAnswer: (questionId: string, answer: ChecklistAnswer) => void;
  /** "Clear All": answers and remarks only. Task types are the user's own. */
  clearAnswers: () => void;
  setRemarks: (remarks: string) => void;
  setNoteToReviewer: (note: string) => void;
  /** Loads an existing draft task back into the wizard so it can be resumed. */
  hydrate: (state: Partial<TaskDraftState>) => void;
  reset: () => void;
}

type DraftData = Omit<
  TaskDraftState,
  | 'setDetails'
  | 'setTaskId'
  | 'toggleTaskType'
  | 'setAnswer'
  | 'clearAnswers'
  | 'setRemarks'
  | 'setNoteToReviewer'
  | 'hydrate'
  | 'reset'
>;

const EMPTY: DraftData = {
  taskId: null,
  taskCode: null,
  createdAt: null,
  submittedAt: null,
  customerId: '',
  crimId: '',
  version: '',
  priority: 'Medium',
  taskTypeIds: [],
  answers: [],
  remarks: '',
  noteToReviewer: '',
};

const VALID_ANSWERS = new Set<string>(CHECKLIST_ANSWERS);
const VALID_PRIORITIES = new Set<string>(PRIORITIES);

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function normaliseTaskTypeIds(value: unknown): TaskTypeId[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(value.filter((entry): entry is string => typeof entry === 'string' && entry !== '')),
  ];
}

/** Last value wins, matching the map used by the checklist progress engine. */
function normaliseAnswers(value: unknown): DraftAnswer[] {
  if (!Array.isArray(value)) return [];

  const byQuestion = new Map<string, ChecklistAnswer>();
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const questionId = record['questionId'];
    const answer = record['answer'];
    if (
      typeof questionId === 'string' &&
      questionId !== '' &&
      typeof answer === 'string' &&
      VALID_ANSWERS.has(answer)
    ) {
      byQuestion.set(questionId, answer as ChecklistAnswer);
    }
  }
  return [...byQuestion].map(([questionId, answer]) => ({ questionId, answer }));
}

/**
 * sessionStorage is an untrusted runtime boundary. A stale release, extension,
 * or manual edit must fall back to an empty field rather than replacing arrays
 * or actions with malformed values and crashing the wizard on refresh.
 */
function normalisePersistedDraft(value: unknown): DraftData {
  const state = typeof value === 'object' && value !== null ? value : {};
  const read = (key: string): unknown => Reflect.get(state, key);
  const priority = read('priority');

  return {
    taskId: nullableString(read('taskId')),
    taskCode: nullableString(read('taskCode')),
    createdAt: nullableString(read('createdAt')),
    submittedAt: nullableString(read('submittedAt')),
    customerId: stringValue(read('customerId')),
    crimId: stringValue(read('crimId')),
    version: stringValue(read('version')),
    priority:
      typeof priority === 'string' && VALID_PRIORITIES.has(priority)
        ? (priority as Priority)
        : EMPTY.priority,
    taskTypeIds: normaliseTaskTypeIds(read('taskTypeIds')),
    answers: normaliseAnswers(read('answers')),
    remarks: stringValue(read('remarks')),
    noteToReviewer: stringValue(read('noteToReviewer')),
  };
}

export const useTaskDraft = create<TaskDraftState>()(
  persist(
    (set) => ({
      ...EMPTY,

      setDetails: (details) => {
        set(details);
      },

      setTaskId: (taskId, taskCode, createdAt, submittedAt) => {
        set(() => ({
          taskId,
          taskCode,
          ...(createdAt !== undefined ? { createdAt } : {}),
          ...(submittedAt !== undefined ? { submittedAt } : {}),
        }));
      },

      toggleTaskType: (taskTypeId) => {
        set((state) => ({
          taskTypeIds: state.taskTypeIds.includes(taskTypeId)
            ? state.taskTypeIds.filter((id) => id !== taskTypeId)
            : [...state.taskTypeIds, taskTypeId],
        }));
      },

      setAnswer: (questionId, answer) => {
        set((state) => {
          // Filtering first also repairs a malformed persisted draft containing
          // the same question more than once.
          const answers = state.answers.filter((entry) => entry.questionId !== questionId);
          return { answers: [...answers, { questionId, answer }] };
        });
      },

      /**
       * Clears what the developer ANSWERED, not what they selected.
       *
       * Task types decide which questions render at all
       * (`checklistRules.visibleCategories` returns `[]` for an empty
       * selection), so clearing them alongside the answers empties the step
       * rather than resetting it — the user loses their place, not just their
       * input, and has to re-pick five checkboxes before they can see a single
       * question again.
       *
       * This is a deliberate deviation from spec §2.6 RMB, which asks for task
       * types to be reset too. Changed on the business's instruction after the
       * behaviour was seen on screen. Do not "fix" it back.
       */
      clearAnswers: () => {
        set({ answers: [], remarks: '' });
      },

      setRemarks: (remarks) => {
        set({ remarks });
      },

      setNoteToReviewer: (noteToReviewer) => {
        set({ noteToReviewer });
      },

      hydrate: (state) => {
        set((current) => ({
          ...state,
          taskTypeIds:
            state.taskTypeIds === undefined
              ? current.taskTypeIds
              : normaliseTaskTypeIds(state.taskTypeIds),
          answers: state.answers === undefined ? current.answers : normaliseAnswers(state.answers),
        }));
      },

      reset: () => {
        set(EMPTY);
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => sessionStorage),
      // Actions are recreated on load; persisting them would serialise functions
      // to `null` and break the store on rehydrate.
      partialize: (state) => ({
        taskId: state.taskId,
        taskCode: state.taskCode,
        customerId: state.customerId,
        crimId: state.crimId,
        version: state.version,
        priority: state.priority,
        taskTypeIds: state.taskTypeIds,
        answers: state.answers,
        remarks: state.remarks,
        noteToReviewer: state.noteToReviewer,
      }),
      merge: (persisted, current) => ({
        ...current,
        ...normalisePersistedDraft(persisted),
      }),
    },
  ),
);

/** Reads an answer without subscribing to the whole answer array. */
export function findAnswer(
  answers: readonly DraftAnswer[],
  questionId: string,
): ChecklistAnswer | undefined {
  // Read from the end so even pre-normalisation malformed state follows the
  // same last-value-wins rule as checklistProgress.
  for (let index = answers.length - 1; index >= 0; index -= 1) {
    const entry = answers[index];
    if (entry?.questionId === questionId && VALID_ANSWERS.has(entry.answer)) return entry.answer;
  }
  return undefined;
}
