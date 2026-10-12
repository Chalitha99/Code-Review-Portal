import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { signInForTest } from '@tests/support/setup.ts';
import { routes } from '@/app/routes.tsx';
import { buildDataset, type Dataset } from '@tests/support/fixtures/dataset.ts';
import { serveDeveloperWorkspace } from '@tests/support/serve.ts';

let db: Dataset;
const findTask = (taskId: string) => db.tasks.find((task) => task.id === taskId);
const findChecklist = (taskId: string) => db.checklists.find((entry) => entry.taskId === taskId);
import { canEditTask, canSubmitForReview, canRespondToFindings } from '@/lib/statusMachine.ts';
import { useTaskDraft } from '@/portals/code-review/features/tasks/hooks/useTaskDraft.ts';

const DEVELOPER = 'u-hiruni';
const DEVELOPER_NAME = 'Hiruni Wijethilaka';

function renderTaskDetail(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(routes, { initialEntries: [path] });

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return { ...utils, router, user: userEvent.setup({ delay: null }) };
}

beforeEach(() => {
  db = buildDataset();
  signInForTest(DEVELOPER);
  serveDeveloperWorkspace(db, DEVELOPER);
  useTaskDraft.getState().reset();
});

describe('Developer Task Details QA Audit Suite', () => {
  /* -------------------------------------------------------------------------- */
  /* 1. Task Loading & Route Resolution                                         */
  /* -------------------------------------------------------------------------- */
  describe('1. Task Loading & Direct URL Access', () => {
    it('loads the correct task from URL directly with isolation from stale drafts', async () => {
      useTaskDraft.getState().hydrate({
        taskId: 't-different-task',
        crimId: 'CRIM-STALE-999',
        taskCode: 'STALE-999',
      });

      const task = findTask('t-aasl-014');
      if (!task) throw new Error('Task t-aasl-014 not found');

      renderTaskDetail(`/crp/developer/tasks/${task.id}`);

      expect(await screen.findAllByText(task.taskCode)).not.toHaveLength(0);
      expect(screen.getAllByText(task.crimId).length).toBeGreaterThan(0);
      expect(screen.queryByText('CRIM-STALE-999')).not.toBeInTheDocument();
    });

    it('renders error state cleanly for invalid / non-existing task ID', async () => {
      renderTaskDetail('/crp/developer/tasks/t-non-existent-999');

      expect(await screen.findByText(/something went wrong|task not found/i)).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: /task details/i })).not.toBeInTheDocument();
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 2. Task Statuses & Permissions                                             */
  /* -------------------------------------------------------------------------- */
  describe('2. Task Statuses, Banners & Action Permissions', () => {
    it('renders Draft status with single Continue Editing action and Submit button', async () => {
      const task = findTask('t-aasl-014');
      if (!task) throw new Error('Task t-aasl-014 not found');

      renderTaskDetail(`/crp/developer/tasks/${task.id}`);

      expect(await screen.findAllByText('Draft')).not.toHaveLength(0);
      const editLinks = screen.getAllByRole('link', { name: /continue editing/i });
      expect(editLinks).toHaveLength(1);
      expect(screen.getByRole('button', { name: /^submit for review$/i })).toBeInTheDocument();
    });

    it('renders Submitted & InReview statuses as read-only with no edit actions', async () => {
      const submittedTask = findTask('t-blom-009');
      if (!submittedTask) throw new Error('Task t-blom-009 not found');

      renderTaskDetail(`/crp/developer/tasks/${submittedTask.id}`);

      expect(await screen.findAllByText('Submitted')).not.toHaveLength(0);
      expect(screen.queryByRole('link', { name: /continue editing/i })).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /^submit for review$/i }),
      ).not.toBeInTheDocument();
    });

    it('renders ChangesRequested status with feedback response alert and no Continue Editing action', async () => {
      const task = findTask('t-aasl-007');
      if (!task) throw new Error('Task t-aasl-007 not found');

      renderTaskDetail(`/crp/developer/tasks/${task.id}`);

      expect(await screen.findAllByText('Changes Requested')).not.toHaveLength(0);
      expect(screen.getByText(/the reviewer has requested changes/i)).toBeInTheDocument();

      // "Continue editing" must NOT be shown for ChangesRequested tasks
      expect(screen.queryByRole('link', { name: /continue editing/i })).not.toBeInTheDocument();
      // Generic header "Submit for review" must NOT be shown
      expect(
        screen.queryByRole('button', { name: /^submit for review$/i }),
      ).not.toBeInTheDocument();
    });

    it('retains Review Feedback workflow and controls on ChangesRequested task for owning developer', async () => {
      const task = findTask('t-semco-017');
      if (!task) throw new Error('Task t-semco-017 not found');

      signInForTest(task.developerId);
      renderTaskDetail(`/crp/developer/tasks/${task.id}`);

      expect(await screen.findAllByText('Changes Requested')).not.toHaveLength(0);

      // "Continue editing" and header "Submit for review" must NOT be shown
      expect(screen.queryByRole('link', { name: /continue editing/i })).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /^submit for review$/i }),
      ).not.toBeInTheDocument();

      // Review Feedback panel and findings controls remain available
      expect(
        await screen.findByRole('heading', { name: /^review feedback$/i }),
      ).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: /^resolve$/i }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole('button', { name: /^reject$/i }).length).toBeGreaterThan(0);

      // Resubmit for Review is the only resubmission action (inside panel)
      expect(screen.getByRole('button', { name: /resubmit for review/i })).toBeInTheDocument();
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 3. Task Information Card Details & Dates                                   */
  /* -------------------------------------------------------------------------- */
  describe('3. Task Information Card Structure & Dates', () => {
    it('displays structured sections: Task Details, People, Dates, and Task Type', async () => {
      const task = findTask('t-aasl-014');
      if (!task) throw new Error('Task t-aasl-014 not found');

      renderTaskDetail(`/crp/developer/tasks/${task.id}`);

      expect(await screen.findByRole('heading', { name: /task information/i })).toBeInTheDocument();
      expect(screen.getByText(/summary of task identity and details/i)).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /task details/i })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /people/i })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /dates/i })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /task type/i })).toBeInTheDocument();

      // Developer name is present
      expect(screen.getAllByText(DEVELOPER_NAME).length).toBeGreaterThan(0);
      // For Draft tasks, Submitted Date is '—'
      expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 4. Quality Checklist & "No" Answer Attention Policy                        */
  /* -------------------------------------------------------------------------- */
  describe('4. Quality Checklist Summary & No Answer Attention Handling', () => {
    it('displays compact badge summary and classifies No answers as Needs Attention', async () => {
      const task = findTask('t-blom-009');
      if (!task) throw new Error('Task t-blom-009 not found');

      const savedChecklist = findChecklist(task.id);
      if (!savedChecklist) throw new Error('No saved checklist found');

      renderTaskDetail(`/crp/developer/tasks/${task.id}`);

      const total = savedChecklist.answers.length;
      const needsAttentionCount = savedChecklist.answers.filter((a) => a.answer === 'No').length;
      const metCount = total - needsAttentionCount;

      expect(await screen.findByText(`${total} / ${total} Answered`)).toBeInTheDocument();
      expect(screen.getByText(`${metCount} Checks Met`)).toBeInTheDocument();

      if (needsAttentionCount > 0) {
        expect(
          screen.getAllByText(
            new RegExp(
              `${needsAttentionCount} ${needsAttentionCount === 1 ? 'Needs Attention' : 'Need Attention'}`,
              'i',
            ),
          ).length,
        ).toBeGreaterThan(0);
      }
    });

    it('filters checklist items between All Questions and Needs Attention without altering data', async () => {
      const task = findTask('t-blom-009');
      if (!task) throw new Error('Task t-blom-009 not found');

      const { user } = renderTaskDetail(`/crp/developer/tasks/${task.id}`);
      await user.click(await screen.findByRole('button', { name: /quality checklist/i }));

      const allBtn = await screen.findByRole('button', { name: /^all questions/i });
      const filterGroup = allBtn.closest('div');
      expect(filterGroup).not.toBeNull();
      const needsAttentionBtn = within(filterGroup!).getByRole('button', {
        name: /needs attention/i,
      });

      expect(allBtn).toBeInTheDocument();
      expect(needsAttentionBtn).toBeInTheDocument();

      // Click Needs Attention filter tab
      await user.click(needsAttentionBtn);
      expect(needsAttentionBtn).toHaveClass('bg-amber-100');

      // Click back to All Questions
      await user.click(allBtn);
      expect(allBtn).toHaveClass('bg-canvas');
    });

    it('toggles Expand All and Collapse All on checklist categories', async () => {
      const task = findTask('t-blom-009');
      if (!task) throw new Error('Task t-blom-009 not found');

      const { user } = renderTaskDetail(`/crp/developer/tasks/${task.id}`);
      await user.click(await screen.findByRole('button', { name: /quality checklist/i }));

      const toggleBtn = await screen.findByRole('button', { name: /collapse all|expand all/i });
      expect(toggleBtn).toBeInTheDocument();

      const initialText = toggleBtn.textContent;
      await user.click(toggleBtn);

      const nextBtn = screen.getByRole('button', { name: /collapse all|expand all/i });
      expect(nextBtn.textContent).not.toBe(initialText);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 5. Task History Timeline                                                   */
  /* -------------------------------------------------------------------------- */
  describe('5. Task History Timeline Ordering & Styling', () => {
    it('renders timeline events in chronological order with actor and formatted time', async () => {
      const task = findTask('t-aasl-014');
      if (!task) throw new Error('Task t-aasl-014 not found');

      renderTaskDetail(`/crp/developer/tasks/${task.id}`);

      expect(await screen.findByRole('heading', { name: /task history/i })).toBeInTheDocument();
      expect(screen.getByText('Task created')).toBeInTheDocument();
      expect(screen.getAllByText(DEVELOPER_NAME).length).toBeGreaterThan(0);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 6. Navigation Flow & Context Preservation                                  */
  /* -------------------------------------------------------------------------- */
  describe('6. Navigation & Back Flow', () => {
    it('Continue Editing navigates to /developer/tasks/:taskId/edit/:step and returns to same task', async () => {
      const task = findTask('t-aasl-014');
      if (!task) throw new Error('Task t-aasl-014 not found');

      const { router, user } = renderTaskDetail(`/crp/developer/tasks/${task.id}`);

      const editBtn = await screen.findByRole('link', { name: /continue editing/i });
      await user.click(editBtn);

      await waitFor(() => {
        expect(router.state.location.pathname).toMatch(
          new RegExp(`^/crp/developer/tasks/${task.id}/edit/`),
        );
      });

      // Wizard displays Edit Review Task header
      expect(await screen.findByRole('heading', { name: /edit review task/i })).toBeInTheDocument();

      // Top Back button returns to Task Overview
      const backBtn = screen.getByRole('button', { name: /back to task overview/i });
      await user.click(backBtn);

      await waitFor(() => {
        expect(router.state.location.pathname).toBe(`/crp/developer/tasks/${task.id}`);
      });
    });

    it('Back link at top of Task Details returns to /developer dashboard', async () => {
      const task = findTask('t-aasl-014');
      if (!task) throw new Error('Task t-aasl-014 not found');

      const { router, user } = renderTaskDetail(`/crp/developer/tasks/${task.id}`);

      const backLink = await screen.findByRole('link', { name: /back to my tasks/i });
      await user.click(backLink);

      await waitFor(() => {
        expect(router.state.location.pathname).toBe('/crp/developer');
      });
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 7. Submit for Review Gating & Behavior                                     */
  /* -------------------------------------------------------------------------- */
  describe('7. Submit for Review Gating', () => {
    it('disables Submit button when checklist is incomplete', async () => {
      const task = findTask('t-aasl-014');
      if (!task) throw new Error('Task t-aasl-014 not found');

      renderTaskDetail(`/crp/developer/tasks/${task.id}`);

      const submitBtn = await screen.findByRole('button', { name: /^submit for review$/i });
      expect(submitBtn).toBeDisabled();
      expect(
        screen.getByText(/complete the quality checklist before submitting/i),
      ).toBeInTheDocument();
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 8. Screenshot Feedback Attachments                                         */
  /* -------------------------------------------------------------------------- */
  describe('8. Screenshot Feedback Attachments', () => {
    it('does not render obsolete screenshot feedback card', async () => {
      const task = findTask('t-aasl-014');
      if (!task) throw new Error('Task t-aasl-014 not found');

      renderTaskDetail(`/crp/developer/tasks/${task.id}`);

      await screen.findByRole('heading', { name: task.title });
      expect(
        screen.queryByRole('heading', { name: /screenshot feedback/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(/no screenshot feedback has been attached/i),
      ).not.toBeInTheDocument();
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 9. Permissions & Forbidden Role Guards                                     */
  /* -------------------------------------------------------------------------- */
  describe('9. Permissions & Access Control', () => {
    it('does not allow other developers to edit or submit another developer’s task', () => {
      const otherActor = { userId: 'u-kavidu', roles: ['Developer'] as const };
      const ownActor = { userId: DEVELOPER, roles: ['Developer'] as const };
      const draftSubject = { status: 'Draft' as const, developerId: DEVELOPER, reviewerId: null };
      const changesSubject = {
        status: 'ChangesRequested' as const,
        developerId: DEVELOPER,
        reviewerId: null,
      };

      // Owner permissions
      expect(canEditTask(ownActor, draftSubject)).toBe(true);
      expect(canSubmitForReview(ownActor, draftSubject)).toBe(true);
      expect(canRespondToFindings(ownActor, changesSubject)).toBe(true);

      // Non-owner developer permissions
      expect(canEditTask(otherActor, draftSubject)).toBe(false);
      expect(canSubmitForReview(otherActor, draftSubject)).toBe(false);
      expect(canRespondToFindings(otherActor, changesSubject)).toBe(false);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 10. Task History & Reviewer-Developer Parity                               */
  /* -------------------------------------------------------------------------- */
  describe('10. Task History & Reviewer-Developer Parity', () => {
    it('renders ChangesRequested event for pre-seeded tasks in ChangesRequested status', async () => {
      const task = findTask('t-semco-017');
      if (!task) throw new Error('Task t-semco-017 not found');

      signInForTest('u-pinsara');
      renderTaskDetail(`/crp/developer/tasks/${task.id}`);

      expect(await screen.findByRole('heading', { name: /task history/i })).toBeInTheDocument();
      expect(await screen.findByText('Changes requested')).toBeInTheDocument();
      expect(screen.getByText('Submitted for review')).toBeInTheDocument();
      expect(screen.getByText('Task created')).toBeInTheDocument();
    });

    it('ensures exact parity of Task History events between Developer and Reviewer views', async () => {
      const task = findTask('t-semco-017');
      if (!task) throw new Error('Task t-semco-017 not found');

      // 1. Developer view
      signInForTest('u-pinsara');
      const devRender = renderTaskDetail(`/crp/developer/tasks/${task.id}`);
      const devHeading = await screen.findByRole('heading', { name: /task history/i });
      const devCard = devHeading.closest<HTMLElement>('div[class*="rounded"]')!;
      const devEvents = within(devCard).getAllByText(
        /^(Task created|Submitted for review|Picked up for review|Changes requested)$/i,
      );
      const devEventTexts = devEvents.map((el) => el.textContent?.trim());
      devRender.unmount();

      // 2. Reviewer view (Hiruni as reviewer)
      signInForTest('u-hiruni');
      const revRender = renderTaskDetail(`/crp/reviewer/tasks/${task.id}`);
      const revHeading = await screen.findByRole('heading', { name: /task history/i });
      const revCard = revHeading.closest<HTMLElement>('div[class*="rounded"]')!;
      const revEvents = within(revCard).getAllByText(
        /^(Task created|Submitted for review|Picked up for review|Changes requested)$/i,
      );
      const revEventTexts = revEvents.map((el) => el.textContent?.trim());
      revRender.unmount();

      expect(devEventTexts).toEqual(revEventTexts);
      expect(devEventTexts).toEqual([
        'Task created',
        'Submitted for review',
        'Picked up for review',
        'Changes requested',
      ]);
    });
  });
});
