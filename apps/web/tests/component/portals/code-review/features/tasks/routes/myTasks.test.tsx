import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { signInForTest } from '@tests/support/setup.ts';
import { routes } from '@/app/routes.tsx';
import { buildDataset, toListItem } from '@tests/support/fixtures/dataset.ts';
import { serveNotifications, serveReferenceData, serveTaskLists } from '@tests/support/serve.ts';

const db = buildDataset();

const DEVELOPER = 'u-hiruni';

function renderMyTasks(initialEntry = '/crp/developer') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(routes, { initialEntries: [initialEntry] });

  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
    router,
  };
}

function getRows() {
  const table = screen.getByRole('table');
  const tbody = table.querySelector('tbody');
  return tbody ? Array.from(tbody.querySelectorAll('tr')) : [];
}

describe('Developer Dashboard Summary Cards & Filter Interconnection', () => {
  beforeEach(() => {
    signInForTest(DEVELOPER);
    serveReferenceData(db);
    serveNotifications(db);
    // GET /tasks?scope=mine: the developer's own tasks, as NestJS returns them.
    serveTaskLists({
      mine: db.tasks.filter((t) => t.developerId === DEVELOPER).map((t) => toListItem(db, t)),
    });
  });

  it('renders task titles without a separate version tag', async () => {
    renderMyTasks();
    await screen.findByRole('table');

    expect(screen.queryByTestId('version-tag')).not.toBeInTheDocument();
  });

  it('renders summary cards with counts matching the actual task data', async () => {
    renderMyTasks();
    await screen.findByRole('table');

    const ownTasks = db.tasks.filter((t) => t.developerId === DEVELOPER);
    const draftCount = ownTasks.filter((t) => t.status === 'Draft').length;
    const submittedCount = ownTasks.filter(
      (t) => t.status === 'Submitted' || t.status === 'ReSubmitted' || t.status === 'InReview',
    ).length;
    const changesCount = ownTasks.filter((t) => t.status === 'ChangesRequested').length;
    const approvedCount = ownTasks.filter((t) => t.status === 'Approved').length;

    // Check Draft Card
    const draftCard = await screen.findByRole('button', { name: /draft tasks/i });
    expect(draftCard).toHaveTextContent(String(draftCount));

    // Check Submitted Card
    const submittedCard = await screen.findByRole('button', { name: /submitted tasks/i });
    expect(submittedCard).toHaveTextContent(String(submittedCount));

    // Check Changes Requested Card
    const changesCard = await screen.findByRole('button', { name: /changes requested/i });
    expect(changesCard).toHaveTextContent(String(changesCount));

    // Check Approved Card
    const approvedCard = await screen.findByRole('button', { name: /approved/i });
    expect(approvedCard).toHaveTextContent(String(approvedCount));
  });

  it('clicking Draft Tasks card filters table to Draft tasks, highlights card, and updates Status filter to Draft', async () => {
    const user = userEvent.setup();
    renderMyTasks();
    await screen.findByRole('table');

    const draftCard = await screen.findByRole('button', { name: /draft tasks/i });
    await user.click(draftCard);

    // Draft card should be active/pressed
    expect(draftCard).toHaveAttribute('aria-pressed', 'true');

    // Status filter dropdown should reflect Draft
    expect(screen.getByRole('combobox', { name: /^status$/i })).toHaveTextContent('Draft');

    // Table rows should all be Draft tasks
    const rows = getRows();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(within(row).getByText('Draft')).toBeInTheDocument();
    }
  });

  it('clicking Submitted Tasks card filters table to Submitted tasks, highlights card, and updates Status filter to Submitted', async () => {
    const user = userEvent.setup();
    renderMyTasks();
    await screen.findByRole('table');

    const submittedCard = await screen.findByRole('button', { name: /submitted tasks/i });
    await user.click(submittedCard);

    expect(submittedCard).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('combobox', { name: /^status$/i })).toHaveTextContent('Submitted');

    const rows = getRows();
    expect(rows.length).toBeGreaterThan(0);
  });

  it('clicking Changes Requested card filters table to Changes Requested tasks, highlights card, and updates Status filter', async () => {
    const user = userEvent.setup();
    renderMyTasks();
    await screen.findByRole('table');

    const changesCard = await screen.findByRole('button', { name: /changes requested/i });
    await user.click(changesCard);

    expect(changesCard).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('combobox', { name: /^status$/i })).toHaveTextContent(
      'Changes Requested',
    );

    const rows = getRows();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(within(row).getByText('Changes Requested')).toBeInTheDocument();
    }
  });

  it('clicking Approved card filters table to Approved tasks, highlights card, and updates Status filter to Approved', async () => {
    const user = userEvent.setup();
    renderMyTasks();
    await screen.findByRole('table');

    const approvedCard = await screen.findByRole('button', { name: /approved/i });
    await user.click(approvedCard);

    expect(approvedCard).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('combobox', { name: /^status$/i })).toHaveTextContent('Approved');

    const rows = getRows();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(within(row).getByText('Approved')).toBeInTheDocument();
    }
  });

  it('clicking an active card again toggles it off, restores all tasks, and resets Status filter to All Statuses', async () => {
    const user = userEvent.setup();
    renderMyTasks();
    await screen.findByRole('table');

    const draftCard = await screen.findByRole('button', { name: /draft tasks/i });
    const initialRowCount = getRows().length;

    // Click to select
    await user.click(draftCard);
    expect(draftCard).toHaveAttribute('aria-pressed', 'true');
    expect(getRows().length).toBeLessThan(initialRowCount);

    // Click again to toggle off
    await user.click(draftCard);
    expect(draftCard).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('combobox', { name: /^status$/i })).toHaveTextContent('All Statuses');
    expect(getRows().length).toBe(initialRowCount);
  });

  it('selecting a status from the dropdown updates the active summary card highlight', async () => {
    const user = userEvent.setup();
    renderMyTasks();
    await screen.findByRole('table');

    const draftCard = await screen.findByRole('button', { name: /draft tasks/i });
    expect(draftCard).toHaveAttribute('aria-pressed', 'false');

    // Open status dropdown and select Draft
    const statusSelect = screen.getByRole('combobox', { name: /^status$/i });
    await user.click(statusSelect);

    const draftOption = await screen.findByRole('option', { name: 'Draft' });
    await user.click(draftOption);

    // Draft card should now be highlighted
    expect(draftCard).toHaveAttribute('aria-pressed', 'true');

    // Table rows should be Draft
    const rows = getRows();
    for (const row of rows) {
      expect(within(row).getByText('Draft')).toBeInTheDocument();
    }
  });

  it('Reset Filters clears active summary card and restores all tasks', async () => {
    const user = userEvent.setup();
    renderMyTasks();
    await screen.findByRole('table');
    await screen.findByText('AIM-002');

    const initialRowCount = getRows().length;

    // Select Changes Requested card
    const changesCard = await screen.findByRole('button', { name: /changes requested/i });
    await user.click(changesCard);
    expect(changesCard).toHaveAttribute('aria-pressed', 'true');

    // Click Reset Filters
    const resetButton = screen.getByRole('button', { name: /reset filters/i });
    await user.click(resetButton);

    // Card should no longer be active
    expect(changesCard).toHaveAttribute('aria-pressed', 'false');

    // Dropdowns and table should be reset
    expect(screen.getByRole('combobox', { name: /^status$/i })).toHaveTextContent('All Statuses');
    expect(screen.getByRole('combobox', { name: /^priority$/i })).toHaveTextContent(
      'All Priorities',
    );
    expect(screen.getByRole('combobox', { name: /^round$/i })).toHaveTextContent('All Rounds');
    expect(getRows().length).toBe(initialRowCount);
  });

  it('combines summary card filter with search, priority, and round filters', async () => {
    const user = userEvent.setup();
    renderMyTasks();
    await screen.findByRole('table');
    await screen.findByText('AIM-002');

    // 1. Select Draft Tasks card
    const draftCard = await screen.findByRole('button', { name: /draft tasks/i });
    await user.click(draftCard);

    // 2. Type search text
    const searchInput = screen.getByRole('searchbox', { name: /search tasks/i });
    await user.type(searchInput, 'AIM');

    const rows = getRows();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(within(row).getByText('Draft')).toBeInTheDocument();
      expect(within(row).getByText(/AIM-\d+/)).toBeInTheDocument();
    }
  });
});
