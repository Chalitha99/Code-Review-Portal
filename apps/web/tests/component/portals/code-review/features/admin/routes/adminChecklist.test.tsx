import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { signInForTest } from '@tests/support/setup.ts';
import { routes } from '@/app/routes.tsx';
import type { ChecklistCategory } from '@sdp/contracts';
import { apiStub, reply } from '@tests/support/apiStub.ts';
import { buildDataset } from '@tests/support/fixtures/dataset.ts';
import { serveNotifications, serveReferenceData, serveTaskLists } from '@tests/support/serve.ts';

function renderChecklist() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(routes, { initialEntries: ['/crp/admin/checklist'] });
  return {
    user: userEvent.setup(),
    ...render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
  };
}
beforeEach(() => {
  signInForTest('u-charith');
  const db = buildDataset();
  serveReferenceData(db);
  serveNotifications(db);
  // The admin shell counts tasks for its header.
  serveTaskLists({});
  apiStub.post('/checklist-categories', ({ body }) => {
    const input = body as { name: string; applicableTaskTypeIds: string[] };
    const created: ChecklistCategory = {
      id: 'cat-new',
      name: input.name,
      order: db.checklistTemplate.length + 1,
      isActive: true,
      applicableTaskTypeIds: input.applicableTaskTypeIds,
      questions: [],
    };
    db.checklistTemplate.push(created);
    return reply(201, created);
  });
});

describe('Admin Quality Checklist', () => {
  it('creates a category from the unified toolbar with category-owned task types', async () => {
    const { user } = renderChecklist();
    await screen.findByText('Reservation');
    await user.click(screen.getByRole('button', { name: /add category/i }));
    const dialog = await screen.findByRole('dialog');
    await user.type(
      within(dialog).getByRole('textbox', { name: /category name/i }),
      'New checklist category',
    );
    await user.click(within(dialog).getByRole('checkbox', { name: 'Customization' }));
    await user.click(within(dialog).getByRole('button', { name: /^add category$/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText('New checklist category')).toBeInTheDocument();
  });

  it('filters categories by task type and opens task type management in a dialog', async () => {
    const { user } = renderChecklist();
    await screen.findByText('Reservation');
    await user.click(screen.getByRole('combobox', { name: 'Task Type filter' }));
    await user.click(await screen.findByRole('option', { name: 'Configuration' }));
    await waitFor(() => expect(screen.queryByText('Reservation')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /manage task types/i }));
    expect(await screen.findByRole('dialog', { name: /manage task types/i })).toBeInTheDocument();
  });

  it('shows the category applicability impact message when task types are removed', async () => {
    const { user } = renderChecklist();
    const edit = await screen.findByRole('button', { name: /edit category: reservation/i });
    await user.click(edit);
    const dialog = await screen.findByRole('dialog');
    const customization = within(dialog).getByRole('checkbox', { name: 'Customization' });
    await user.click(customization);
    expect(
      within(dialog).getByText(/Previously submitted checklist versions will not change/i),
    ).toBeInTheDocument();
  });
});
