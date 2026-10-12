import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { Task } from '@sdp/contracts';
import { routes } from '@/app/routes.tsx';
import { buildDataset, type Dataset } from '@tests/support/fixtures/dataset.ts';
import { serveDeveloperWorkspace } from '@tests/support/serve.ts';

let db: Dataset;
/** What NestJS has stored for the task's checklist (the PUT /checklist body it accepted). */
const findChecklist = (taskId: string) => db.checklists.find((entry) => entry.taskId === taskId);
import { signInForTest } from '@tests/support/setup.ts';
import {
  useTaskDraft,
  type TaskDraftState,
} from '@/portals/code-review/features/tasks/hooks/useTaskDraft.ts';

const DEVELOPER = 'u-hiruni';

function renderRoute(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...result, router, user: userEvent.setup({ delay: null }) };
}

function editableTask(): Task {
  const task = db.tasks.find(
    (candidate) => candidate.developerId === DEVELOPER && candidate.status === 'Draft',
  );
  if (!task) throw new Error('fixtures have no editable task for the checklist QA suite');
  return task;
}

function hydrateTask(overrides: Partial<TaskDraftState> = {}): Task {
  const task = editableTask();
  useTaskDraft.getState().hydrate({
    taskId: task.id,
    taskCode: task.taskCode,
    customerId: task.customerId,
    crimId: task.crimId,
    version: task.version ?? '',
    priority: task.priority,
    taskTypeIds: [],
    answers: [],
    remarks: '',
    noteToReviewer: '',
    ...overrides,
  });
  return task;
}

function renderChecklist(overrides: Partial<TaskDraftState> = {}) {
  const task = hydrateTask(overrides);
  return { task, ...renderRoute('/crp/developer/tasks/new/checklist') };
}

beforeEach(() => {
  db = buildDataset();
  signInForTest(DEVELOPER);
  serveDeveloperWorkspace(db, DEVELOPER);
  useTaskDraft.getState().reset();
});

describe('Quality Checklist complete functional QA', () => {
  it('loads each task type and every combination as a de-duplicated union', async () => {
    const { user } = renderChecklist();

    const cases = [
      {
        name: 'Customization',
        count: 23,
        categories: [
          'Reservation',
          'Code',
          'Security',
          'Translations',
          'Unit Testing',
          'Completion',
        ],
      },
      {
        name: 'Configuration',
        count: 8,
        categories: ['Configurations', 'Unit Testing', 'Completion'],
      },
      {
        name: 'Lobby',
        count: 8,
        categories: ['Configurations', 'Unit Testing', 'Completion'],
      },
      {
        name: 'Quick Report',
        count: 9,
        categories: ['Quick Reports', 'Unit Testing', 'Completion'],
      },
      {
        name: 'Upgrade Service',
        count: 10,
        categories: ['Upgrade Quality', 'Unit Testing', 'Completion'],
      },
    ] as const;

    for (const item of cases) {
      const checkbox = await screen.findByRole('checkbox', { name: item.name });
      const card = checkbox.closest('label');
      expect(card).not.toBeNull();

      await user.click(checkbox);
      expect(checkbox).toBeChecked();
      expect(card).toHaveClass('border-violet-600');
      expect(screen.getAllByRole('radiogroup')).toHaveLength(item.count);
      for (const category of item.categories) {
        expect(screen.getByRole('heading', { name: category })).toBeInTheDocument();
      }

      await user.click(checkbox);
      expect(checkbox).not.toBeChecked();
      expect(card).not.toHaveClass('border-violet-600');
      expect(screen.queryAllByRole('radiogroup')).toHaveLength(0);
    }

    for (const item of cases) {
      await user.click(screen.getByRole('checkbox', { name: item.name }));
    }

    const groups = screen.getAllByRole('radiogroup');
    expect(groups).toHaveLength(29);
    expect(new Set(groups.map((group) => group.getAttribute('aria-label'))).size).toBe(29);
    expect(screen.getAllByText('0 of 29 answered').length).toBeGreaterThan(0);
  });

  it('keeps radio state, accordion state, section counts, overall counts and progress synchronized', async () => {
    const { user } = renderChecklist();
    await user.click(await screen.findByRole('checkbox', { name: 'Quick Report' }));

    const progressbar = screen.getByRole('progressbar', { name: /section progress/i });
    expect(progressbar).toHaveAttribute('aria-valuenow', '0');
    expect(progressbar).toHaveAttribute('aria-valuetext', '0 of 9 answered');

    const first = screen.getAllByRole('radiogroup')[0]!;
    const second = screen.getAllByRole('radiogroup')[1]!;
    const yes = within(first).getByRole('radio', { name: 'Yes' });
    const no = within(first).getByRole('radio', { name: 'No' });
    const notApplicable = within(first).getByRole('radio', { name: 'N/A' });

    await user.click(yes);
    expect(yes).toHaveAttribute('aria-checked', 'true');
    expect(no).toHaveAttribute('aria-checked', 'false');
    await user.click(no);
    expect(yes).toHaveAttribute('aria-checked', 'false');
    expect(no).toHaveAttribute('aria-checked', 'true');
    await user.click(notApplicable);
    expect(notApplicable).toHaveAttribute('aria-checked', 'true');
    expect(no).toHaveAttribute('aria-checked', 'false');

    // A real radio group exposes only its selected option as a tab stop. Arrow
    // movement is exercised in Playwright because jsdom has no layout for
    // Radix's roving-focus implementation.
    await user.click(yes);
    expect(yes).toHaveAttribute('tabindex', '0');
    expect(no).toHaveAttribute('tabindex', '-1');

    await user.click(within(second).getByRole('radio', { name: 'No' }));
    expect(yes).toHaveAttribute('aria-checked', 'true');
    expect(within(second).getByRole('radio', { name: 'No' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(progressbar).toHaveAttribute('aria-valuenow', '22');
    expect(progressbar).toHaveAttribute('aria-valuetext', '2 of 9 answered');
    expect(screen.getByText(/quick reports — 2 of 2 answered/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Quick Reports' }));
    expect(screen.getAllByRole('radiogroup')).toHaveLength(7);
    expect(progressbar).toHaveAttribute('aria-valuetext', '2 of 9 answered');
    await user.click(screen.getByRole('button', { name: 'Quick Reports' }));
    expect(screen.getAllByRole('radiogroup')).toHaveLength(9);
    expect(
      within(screen.getAllByRole('radiogroup')[0]!).getByRole('radio', { name: 'Yes' }),
    ).toHaveAttribute('aria-checked', 'true');
  });

  it('preserves an answer during unsaved reselection, then drops it after a full-replacement save', async () => {
    const { task, user } = renderChecklist();
    const customization = await screen.findByRole('checkbox', { name: 'Customization' });
    const quickReport = screen.getByRole('checkbox', { name: 'Quick Report' });
    await user.click(customization);
    await user.click(quickReport);

    const quickQuestionName = /have you used views instead of tables/i;
    const quickQuestion = screen.getByRole('radiogroup', { name: quickQuestionName });
    await user.click(within(quickQuestion).getByRole('radio', { name: 'Yes' }));
    expect(screen.getAllByText('1 of 25 answered').length).toBeGreaterThan(0);

    await user.click(quickReport);
    expect(screen.queryByRole('radiogroup', { name: quickQuestionName })).not.toBeInTheDocument();
    expect(screen.getAllByText('0 of 23 answered').length).toBeGreaterThan(0);

    await user.click(quickReport);
    expect(
      within(screen.getByRole('radiogroup', { name: quickQuestionName })).getByRole('radio', {
        name: 'Yes',
      }),
    ).toHaveAttribute('aria-checked', 'true');

    await user.click(quickReport);
    await user.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(findChecklist(task.id)?.taskTypeIds).toEqual(['tt-customization']);
    });
    expect(useTaskDraft.getState().answers).not.toContainEqual({
      questionId: 'q-quick-reports-1',
      answer: 'Yes',
    });

    await user.click(quickReport);
    expect(
      within(screen.getByRole('radiogroup', { name: quickQuestionName })).getByRole('radio', {
        name: 'Yes',
      }),
    ).toHaveAttribute('aria-checked', 'false');
  });

  it('saves empty and partial drafts, long/special remarks, then restores them on reopen', async () => {
    const { task, user, unmount } = renderChecklist();
    const remarks = await screen.findByLabelText(/additional remarks/i);

    fireEvent.change(remarks, { target: { value: '  Notes <>&\n漢字  ' } });
    await user.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(findChecklist(task.id)?.taskTypeIds).toEqual([]);
    });
    expect(findChecklist(task.id)?.isComplete).toBe(false);
    expect(findChecklist(task.id)?.remarks).toBe('Notes <>&\n漢字');

    await user.click(screen.getByRole('checkbox', { name: 'Quick Report' }));
    const first = screen.getAllByRole('radiogroup')[0]!;
    await user.click(within(first).getByRole('radio', { name: 'No' }));
    const longRemarks = `${'x'.repeat(5_000)}\n<script>alert(1)</script>`;
    fireEvent.change(remarks, { target: { value: longRemarks } });
    expect(remarks).toHaveValue(longRemarks);
    await user.click(screen.getByRole('button', { name: /save draft/i }));

    await waitFor(() => {
      expect(findChecklist(task.id)?.answers).toHaveLength(1);
    });
    expect(findChecklist(task.id)?.remarks).toBe(longRemarks);

    unmount();
    useTaskDraft.getState().reset();
    const reopened = renderRoute(`/crp/developer/tasks/${task.id}/edit`);
    await waitFor(() => {
      expect(reopened.router.state.location.pathname).toBe(
        `/crp/developer/tasks/${task.id}/edit/checklist`,
      );
    });
    expect(await screen.findByRole('checkbox', { name: 'Quick Report' })).toBeChecked();
    expect(
      within(screen.getAllByRole('radiogroup')[0]!).getByRole('radio', { name: 'No' }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText(/additional remarks/i)).toHaveValue(longRemarks);
  });

  it('shows exact Step 2 data on review and refreshes the review after editing backward', async () => {
    const { router, user } = renderChecklist();
    await user.click(await screen.findByRole('checkbox', { name: 'Quick Report' }));

    const groups = screen.getAllByRole('radiogroup');
    for (let index = 0; index < groups.length; index += 1) {
      await user.click(
        within(groups[index]!).getByRole('radio', { name: index === 0 ? 'No' : 'Yes' }),
      );
    }
    fireEvent.change(screen.getByLabelText(/additional remarks/i), {
      target: { value: 'Review this <edge> & keep it.' },
    });
    expect(useTaskDraft.getState().answers.filter((entry) => entry.answer === 'No')).toHaveLength(
      1,
    );

    await user.click(screen.getByRole('button', { name: /next: review & submit/i }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/crp/developer/tasks/new/review');
    });
    await screen.findByRole('heading', { name: 'Checklist Summary' });
    expect(screen.getByText('Quick Report')).toBeInTheDocument();
    expect(screen.getByText('Review this <edge> & keep it.')).toBeInTheDocument();
    const reviewedQuestion = screen
      .getByText('Have you used views instead of tables?')
      .closest('li');
    expect(reviewedQuestion).not.toBeNull();
    expect(within(reviewedQuestion!).getByText('No')).toBeInTheDocument();

    const editButtons = screen.getAllByRole('button', { name: /edit/i });
    await user.click(editButtons[1]!);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/crp/developer/tasks/new/checklist');
    });
    const first = screen.getAllByRole('radiogroup')[0]!;
    await user.click(within(first).getByRole('radio', { name: 'N/A' }));
    fireEvent.change(screen.getByLabelText(/additional remarks/i), {
      target: { value: 'Updated remarks' },
    });
    await user.click(screen.getByRole('button', { name: /next: review & submit/i }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/crp/developer/tasks/new/review');
    });
    await screen.findByRole('heading', { name: 'Checklist Summary' });
    expect(screen.getByText('Updated remarks')).toBeInTheDocument();
    expect(screen.queryByText('Review this <edge> & keep it.')).not.toBeInTheDocument();
    const updatedQuestion = screen
      .getByText('Have you used views instead of tables?')
      .closest('li');
    expect(updatedQuestion).not.toBeNull();
    expect(within(updatedQuestion!).getByText('N/A')).toBeInTheDocument();
  });

  it('guards direct step URLs and repairs duplicate or malformed hydrated state', async () => {
    const direct = renderRoute('/crp/developer/tasks/new/checklist');
    await waitFor(() => {
      expect(direct.router.state.location.pathname).toBe('/crp/developer/tasks/new/details');
    });
    direct.unmount();

    const task = hydrateTask();
    const review = renderRoute('/crp/developer/tasks/new/review');
    await waitFor(() => {
      expect(review.router.state.location.pathname).toBe('/crp/developer/tasks/new/checklist');
    });
    review.unmount();

    useTaskDraft.getState().hydrate({
      taskId: task.id,
      taskTypeIds: ['tt-quick-report', 'tt-quick-report'],
      answers: [
        { questionId: 'q-quick-reports-1', answer: 'Yes' },
        { questionId: 'q-quick-reports-1', answer: 'No' },
        // Simulates state written by an obsolete/corrupt client release.
        { questionId: 'q-quick-reports-2', answer: 'Maybe' },
      ] as TaskDraftState['answers'],
    });
    expect(useTaskDraft.getState().taskTypeIds).toEqual(['tt-quick-report']);
    expect(useTaskDraft.getState().answers).toEqual([
      { questionId: 'q-quick-reports-1', answer: 'No' },
    ]);
  });

  it('automatically recovers when an existing draft taskId returns 404 on update', async () => {
    // Seed draft with a non-existent/stale taskId
    useTaskDraft.getState().hydrate({
      taskId: 'task-non-existent-999',
      taskCode: 'AASL-999',
      customerId: 'c-aasl',
      crimId: '999',
      version: 'V1',
      priority: 'Medium',
      taskTypeIds: ['tt-quick-report'],
    });

    const { user, router } = renderRoute('/crp/developer/tasks/new/details');

    const nextBtn = await screen.findByRole('button', { name: /next: quality checklist/i });
    await user.click(nextBtn);

    // Should self-heal by creating a new task and advancing to checklist without 404 toast error
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/crp/developer/tasks/new/checklist');
    });

    const state = useTaskDraft.getState();
    expect(state.taskId).not.toBe('task-non-existent-999');
    expect(state.taskId).toBeTruthy();
  });

  it('verifies Step 2 footer status messages across all completion states', async () => {
    const { user } = renderChecklist();

    // 1. Initial Step 2 state: no task types selected
    expect(await screen.findByText(/select at least one task type to load/i)).toBeInTheDocument();
    // Stale Step 1 messages must never appear
    expect(screen.queryByText(/required field(s)? remaining/i)).not.toBeInTheDocument();

    // 2. Select Quick Report (9 questions)
    await user.click(await screen.findByRole('checkbox', { name: 'Quick Report' }));
    expect((await screen.findAllByText('0 of 9 answered')).length).toBeGreaterThan(0);

    // 3. Answer 8 of the 9 questions
    const groups = screen.getAllByRole('radiogroup');
    for (let i = 0; i < 8; i += 1) {
      await user.click(within(groups[i]!).getByRole('radio', { name: 'Yes' }));
    }
    expect((await screen.findAllByText('8 of 9 answered')).length).toBeGreaterThan(0);

    // 4. Answer the last question (9 of 9 answered)
    await user.click(within(groups[8]!).getByRole('radio', { name: 'No' }));
    expect((await screen.findAllByText('All Complete')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('9 of 9 answered')).length).toBeGreaterThan(0);
  });

  it('persists Created Date and keeps Submitted Date null across draft edits, reloads, and saves', async () => {
    const testCreatedAt = '2026-01-15T10:30:00.000Z';
    const task = hydrateTask({
      createdAt: testCreatedAt,
      submittedAt: null,
    });

    const { user, unmount } = renderRoute(`/crp/developer/tasks/${task.id}/edit/details`);

    // System information displays initial created date
    expect(await screen.findByText(/jan 15, 2026/i)).toBeInTheDocument();
    // Submitted date is empty '—' while in Draft
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);

    // Save draft
    await user.click(screen.getByRole('button', { name: /save draft/i }));

    // Created date in store must remain unchanged
    expect(useTaskDraft.getState().createdAt).toBe(testCreatedAt);
    expect(useTaskDraft.getState().submittedAt).toBeNull();

    unmount();

    // Reopen edit task route
    const reopened = renderRoute(`/crp/developer/tasks/${task.id}/edit/details`);
    expect(await reopened.findByText(/jan 15, 2026/i)).toBeInTheDocument();
    expect(useTaskDraft.getState().createdAt).toBe(testCreatedAt);
    expect(useTaskDraft.getState().submittedAt).toBeNull();
  });
});
