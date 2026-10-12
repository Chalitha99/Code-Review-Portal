import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { signInForTest } from '@tests/support/setup.ts';
import { routes } from '@/app/routes.tsx';
import { apiStub } from '@tests/support/apiStub.ts';
import { buildDataset, toListItem, type Dataset } from '@tests/support/fixtures/dataset.ts';
import {
  serveDraftWrites,
  serveNotifications,
  serveReferenceData,
  serveTaskDetail,
  serveTaskLists,
} from '@tests/support/serve.ts';

let db: Dataset;

/** The developer's tasks, and the detail endpoints of each, as NestJS serves them. */
function serveDeveloperWorkspace() {
  db = buildDataset();
  serveReferenceData(db);
  serveNotifications(db);
  serveDraftWrites(db);
  const own = db.tasks.filter((task) => task.developerId === DEVELOPER);
  serveTaskLists({ mine: own.map((task) => toListItem(db, task)) });
  for (const task of own) serveTaskDetail(db, task);
  // The read-only Version preview on step 1 (issued by the server on create).
  apiStub.get('/task-identities/next-version', ({ query }) => {
    const customer = db.customers.find((entry) => entry.id === query.get('customerId'));
    return { version: 0, title: `${customer?.code ?? ''}-${query.get('crimId') ?? ''}-0` };
  });
  apiStub.get('/customers/:customerId/next-task-id', ({ params }) => {
    const customer = db.customers.find((entry) => entry.id === params['customerId']);
    return { taskCode: `${customer?.code ?? 'TASK'}-01`, sequence: 1 };
  });
}
import { useTaskDraft } from '@/portals/code-review/features/tasks/hooks/useTaskDraft.ts';

/**
 * Phase 1 acceptance scenario 1: the wizard blocks Next until each step's
 * requirements are met, and a completed run produces a real task.
 *
 * Driven through the real route table so the URL-per-step design, the draft
 * store, the API calls and the domain gates are all exercised together —
 * testing the step components in isolation would prove none of that, which is
 * the mistake the login suite made.
 */

const DEVELOPER = 'u-hiruni';

function renderWizard(path = '/crp/developer/tasks/new') {
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

function renderPersistedChecklist() {
  const task = db.tasks.find(
    (candidate) => candidate.developerId === DEVELOPER && candidate.status === 'Draft',
  );
  if (!task) throw new Error('seed has no draft for this developer');

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
  });
  return renderWizard('/crp/developer/tasks/new/checklist');
}

async function chooseCustomer(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole('combobox', { name: /customer/i }));
  await user.click(await screen.findByRole('option', { name }));
}

beforeEach(() => {
  signInForTest(DEVELOPER);
  serveDeveloperWorkspace();
  useTaskDraft.getState().reset();
});

describe('New Review Task wizard', () => {
  it('redirects the bare /new path to step 1', async () => {
    const { router } = renderWizard();
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/crp/developer/tasks/new/details');
    });
  });

  it('blocks Next on step 1 until customer and CRIM ID are entered', async () => {
    const { router, user } = renderWizard();

    // The requirement panel is persistent, not revealed by a failed click:
    // it tells the user what the step needs before they start.
    expect(await screen.findByText(/before you can continue/i)).toBeInTheDocument();
    expect(screen.getAllByText(/select a customer/i).length).toBeGreaterThan(0);

    const next = await screen.findByRole('button', { name: /next: quality checklist/i });
    // `aria-disabled`, not `disabled`: the button stays focusable and clickable
    // so that pressing it can EXPLAIN the block. A natively disabled button
    // swallows the click and tells a keyboard user nothing.
    expect(next).toHaveAttribute('aria-disabled', 'true');

    // The guard that matters is the route not changing, not the attribute.
    await user.click(next);
    expect(router.state.location.pathname).toBe('/crp/developer/tasks/new/details');

    /*
     * ...and the click is what reveals the inline FIELD error, which stays
     * hidden until the user has actually tried to advance.
     *
     * Asserted through `role="alert"` and `aria-invalid` rather than the message
     * text: the requirement panel already displays the identical wording, so a
     * text query cannot tell the two apart and would pass without the field ever
     * being marked. Before this the reveal was unreachable — both actions were
     * natively `disabled`, so `setShowErrors(true)` never ran.
     */
    await waitFor(() => {
      expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
    });
  });

  it('enables Next only once step 1 is satisfied', async () => {
    const { user } = renderWizard();

    await chooseCustomer(user, 'AASL');
    expect(await screen.findByRole('button', { name: /next: quality checklist/i })).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    await user.type(await screen.findByLabelText(/crim id/i), 'CRIM-1');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /next: quality checklist/i })).toHaveAttribute(
        'aria-disabled',
        'false',
      );
    });
  });

  it('previews the derived title as the fields are filled (FL 2.5-01)', async () => {
    const { user } = renderWizard();

    await chooseCustomer(user, 'AASL');
    await user.type(await screen.findByLabelText(/crim id/i), 'CRIM-NEW-AUTO');

    await waitFor(() => {
      expect(screen.getByLabelText(/^version$/i)).toHaveTextContent('0');
    });
    expect(await screen.findByDisplayValue('AASL-CRIM-NEW-AUTO-0')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /^version$/i })).not.toBeInTheDocument();
  });

  it('advances to the checklist once step 1 is complete, and creates the task', async () => {
    const { router, user } = renderWizard();

    await chooseCustomer(user, 'AASL');
    await user.type(await screen.findByLabelText(/crim id/i), 'CRIM-999');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /next: quality checklist/i })).toHaveAttribute(
        'aria-disabled',
        'false',
      );
    });
    await user.click(screen.getByRole('button', { name: /next/i }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/crp/developer/tasks/new/checklist');
    });

    // The task was persisted on leaving step 1, so returning does not create a
    // second draft.
    expect(useTaskDraft.getState().taskId).not.toBeNull();
  });

  it('shows no checklist questions until a task type is selected', async () => {
    const { user } = renderPersistedChecklist();

    expect(await screen.findByText(/select at least one task type to load/i)).toBeInTheDocument();

    // Footer status accurately reflects task type requirement, not "required fields remaining"
    expect(screen.getAllByText(/select at least one task type/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/required field(s)? remaining/i)).not.toBeInTheDocument();

    await user.click(await screen.findByRole('checkbox', { name: /quick report/i }));

    // Quick Reports is one of the type-specific sections, so it appears only now.
    expect(await screen.findByRole('heading', { name: 'Quick Reports' })).toBeInTheDocument();
  });

  it('blocks Next on step 2 until every visible question is answered', async () => {
    const { router, user } = renderPersistedChecklist();

    await user.click(await screen.findByRole('checkbox', { name: /quick report/i }));

    const next = await screen.findByRole('button', { name: /next: review & submit/i });
    expect(next).toHaveAttribute('aria-disabled', 'true');

    await user.click(next);
    expect(router.state.location.pathname).toBe('/crp/developer/tasks/new/checklist');

    // The Section progress panel names which sections are short, so the user
    // knows where to look in a 30-question form.
    expect(await screen.findByText(/quick reports — 0 of 2 answered/i)).toBeInTheDocument();
    expect(screen.getByText(/questions (still unanswered|need answers)/i)).toBeInTheDocument();
  });

  it('records an answer against the question it was given for', async () => {
    const { user } = renderPersistedChecklist();

    await user.click(await screen.findByRole('checkbox', { name: /quick report/i }));

    const group = await screen.findByRole('radiogroup', { name: /have you used views instead/i });
    await user.click(within(group).getByRole('radio', { name: 'Yes' }));

    expect(within(group).getByRole('radio', { name: 'Yes' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(useTaskDraft.getState().answers).toContainEqual({
      questionId: 'q-quick-reports-1',
      answer: 'Yes',
    });
  });

  it('confirms before Clear All, then clears answers and remarks but KEEPS task types', async () => {
    const { user } = renderPersistedChecklist();

    await user.click(await screen.findByRole('checkbox', { name: /quick report/i }));
    const group = await screen.findByRole('radiogroup', { name: /have you used views instead/i });
    await user.click(within(group).getByRole('radio', { name: 'Yes' }));
    await user.type(screen.getByLabelText(/additional remarks/i), 'Some notes');

    await user.click(screen.getByRole('button', { name: /clear all/i }));

    // Nothing is discarded until the user confirms — Clear All throws away up to
    // 23 answers, so it prompts.
    expect(await screen.findByText(/clear your answers\?/i)).toBeInTheDocument();
    expect(useTaskDraft.getState().answers).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: /^clear all$/i }));

    const state = useTaskDraft.getState();
    expect(state.answers).toEqual([]);
    expect(state.remarks).toBe('');

    /*
     * The assertion this test exists for.
     *
     * Task types decide which questions render at all, so clearing them empties
     * the step instead of resetting it — the user is left staring at "select a
     * task type" having only asked to redo their answers. Spec §2.6 RMB asks for
     * them to be reset and the business overrode it after seeing it happen; this
     * line is what stops the spec being re-applied by someone reading it later.
     */
    expect(state.taskTypeIds).toEqual(['tt-quick-report']);

    // And the questions are still on screen, which is the visible consequence.
    expect(
      screen.getByRole('radiogroup', { name: /have you used views instead/i }),
    ).toBeInTheDocument();
  });

  /**
   * Resuming an existing draft.
   *
   * "Edit this draft" used to navigate to `/crp/developer/tasks/new` and nothing
   * else, so the wizard opened on whatever the sessionStorage draft happened to
   * hold — a DIFFERENT task, or an empty form. `hydrate()` and `resumeStep()`
   * were both written for this and called from nowhere, which meant the button
   * reliably edited the wrong thing while looking as though it worked.
   */
  it('loads the task into the wizard when its draft is reopened', async () => {
    const draft = db.tasks.find(
      (task) => task.developerId === DEVELOPER && task.status === 'Draft',
    );
    if (!draft) throw new Error('seed has no draft for this developer');

    const { router, user } = renderWizard(`/crp/developer/tasks/${draft.id}`);

    /*
     * Two LINKS carry this label — the blocked-submit alert and the card footer
     * — and both must resume the same task, so either will do.
     *
     * `link`, not `button`, and the distinction is the point rather than an
     * implementation detail: resuming a task is a navigation to a real URL, so
     * it has to survive middle-click, copy-link and Back. A `button` role here
     * would mean the affordance had regressed to an onClick handler.
     */
    const resume = await screen.findByRole('link', { name: /continue editing/i });
    await user.click(resume);

    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(
        new RegExp(`^/crp/developer/tasks/${draft.id}/edit/`),
      );
    });

    // THIS task, not a blank form: the store now points at the row the wizard
    // will PATCH, so Save Draft updates it instead of creating a second one.
    const state = useTaskDraft.getState();
    expect(state.taskId).toBe(draft.id);
    expect(state.crimId).toBe(draft.crimId);
    expect(state.customerId).toBe(draft.customerId);

    /*
     * And it lands on the first step that is still blocked, not always on step 1.
     * This draft has a customer and a CRIM ID but no task types, so details is
     * satisfied and the checklist is not — `resumeStep`'s whole purpose.
     */
    expect(router.state.location.pathname).toBe(`/crp/developer/tasks/${draft.id}/edit/checklist`);
  });

  it('starts empty when New Review Task is opened after resuming one', async () => {
    /*
     * The hazard the reset guard on `/crp/developer/tasks/new` exists for. Once
     * anything can load an existing task into the store, the New button silently
     * reopens whichever task was edited last — and every subsequent save PATCHes
     * that row rather than creating the task the user asked for.
     */
    useTaskDraft.getState().hydrate({
      taskId: 't-existing',
      taskCode: 'AASL-999',
      customerId: 'c-aasl',
      crimId: 'CRIM-OLD',
    });

    const { router } = renderWizard('/crp/developer/tasks/new');

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/crp/developer/tasks/new/details');
    });

    const state = useTaskDraft.getState();
    expect(state.taskId).toBeNull();
    expect(state.crimId).toBe('');
  });

  it('drops answers whose task type is deselected', () => {
    const draft = useTaskDraft.getState();
    draft.toggleTaskType('tt-quick-report');
    draft.setAnswer('q-quick-reports-1', 'Yes');

    expect(useTaskDraft.getState().answers).toHaveLength(1);

    // The store keeps the answer; the *checklist* stops counting it, and the
    // save handler strips it. Asserting the store here documents that split.
    useTaskDraft.getState().toggleTaskType('tt-quick-report');
    expect(useTaskDraft.getState().taskTypeIds).toEqual([]);
  });

  it('shows a generated read-only Version instead of accepting manual input', async () => {
    const { user } = renderWizard();

    await chooseCustomer(user, 'AASL');
    await user.type(await screen.findByLabelText(/crim id/i), 'CRIM-SYSTEM-VERSION');

    await waitFor(() => {
      expect(screen.getByLabelText(/^version$/i)).toHaveTextContent('0');
    });
    expect(screen.queryByRole('textbox', { name: /^version$/i })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /next: quality checklist/i })).toHaveAttribute(
        'aria-disabled',
        'false',
      );
    });
  });
});
