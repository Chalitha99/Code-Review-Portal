import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderApp } from '@tests/support/renderApp.tsx';
import { apiError, apiStub } from '@tests/support/apiStub.ts';
import { buildDataset, type Dataset } from '@tests/support/fixtures/dataset.ts';
import { serveReferenceData } from '@tests/support/serve.ts';

const PATH = '/crp/admin/checklist';
let db: Dataset;

beforeEach(() => {
  db = buildDataset();
  serveReferenceData(db);
  // Users tab, for the leave-page test.
  apiStub.get('/tasks', () => ({ items: [], pagination: { page: 1, pageSize: 1, total: 0 } }));
  apiStub.patch('/checklist-categories/order', ({ body }) => {
    const ids = (body as { ids: string[] }).ids;
    for (const [index, id] of ids.entries()) {
      const category = db.checklistTemplate.find((entry) => entry.id === id);
      if (category) category.order = index + 1;
    }
    return db.checklistTemplate;
  });
  // NestJS's NAME_TAKEN rule, case-insensitive (tested in apps/api task-types).
  apiStub.post('/task-types', ({ body }) => {
    const name = (body as { name: string }).name;
    if (db.taskTypes.some((type) => type.name.toLowerCase() === name.toLowerCase())) {
      return apiError(409, 'NAME_TAKEN', 'A task type with that name already exists.');
    }
    return apiError(500, 'INTERNAL_ERROR', 'not expected in this test');
  });
});

function categoriesByOrder() {
  return [...db.checklistTemplate].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

async function moveFirstCategoryDown() {
  const [first, second] = categoriesByOrder();
  const handle = await screen.findByRole('button', { name: `Reorder category: ${first!.name}` });
  fireEvent.keyDown(handle, { key: 'ArrowDown' });
  expect(
    await screen.findByRole('complementary', { name: /unsaved ordering changes/i }),
  ).toBeVisible();
  return { first: first!, second: second! };
}

function renderedCategoryOrder(): string[] {
  return screen
    .getAllByRole('button', { name: /^Reorder category: / })
    .map((b) => b.getAttribute('aria-label')!.replace('Reorder category: ', ''));
}

describe('admin checklist ordering', () => {
  it('keeps a keyboard reorder as an unsaved draft until it is saved', async () => {
    const { user } = renderApp(PATH);
    const { first, second } = await moveFirstCategoryDown();

    expect(renderedCategoryOrder().slice(0, 2)).toEqual([second.name, first.name]);
    // Nothing persisted yet.
    expect(categoriesByOrder()[0]!.id).toBe(first.id);

    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => {
      expect(
        categoriesByOrder()
          .slice(0, 2)
          .map((c) => c.id),
      ).toEqual([second.id, first.id]);
    });
    await waitFor(() => {
      expect(screen.queryByRole('complementary', { name: /unsaved ordering changes/i })).toBeNull();
    });
  });

  it('discards a draft reorder without touching the saved order', async () => {
    const { user } = renderApp(PATH);
    const { first, second } = await moveFirstCategoryDown();

    await user.click(screen.getByRole('button', { name: 'Discard Changes' }));
    await waitFor(() => {
      expect(renderedCategoryOrder().slice(0, 2)).toEqual([first.name, second.name]);
    });
    expect(categoriesByOrder()[0]!.id).toBe(first.id);
  });

  it('asks before leaving the page with unsaved ordering, and can stay', async () => {
    const { user, router } = renderApp(PATH);
    await moveFirstCategoryDown();

    await router.navigate('/crp/admin/users');
    const dialog = await screen.findByRole('dialog', { name: /discard unsaved changes/i });
    await user.click(within(dialog).getByRole('button', { name: 'Stay on Page' }));

    expect(router.state.location.pathname).toBe(PATH);
    expect(screen.getByRole('complementary', { name: /unsaved ordering changes/i })).toBeVisible();
  });
});

describe('admin task types', () => {
  it('rejects a duplicate task type name regardless of case', async () => {
    const { user } = renderApp(PATH);
    const existing = db.taskTypes[0]!.name;

    await user.click(await screen.findByRole('button', { name: /manage task types/i }));
    const manager = await screen.findByRole('dialog');
    await user.click(within(manager).getAllByRole('button', { name: /add task type/i })[0]!);

    const form = await screen.findByRole('dialog', { name: 'Add Task Type' });
    await user.type(
      within(form).getByRole('textbox', { name: /task type name/i }),
      existing.toUpperCase(),
    );
    await user.click(within(form).getByRole('button', { name: 'Add Task Type' }));

    expect(
      await within(form).findByText('A task type with that name already exists.'),
    ).toBeVisible();
    expect(
      db.taskTypes.filter((t) => t.name.toLowerCase() === existing.toLowerCase()),
    ).toHaveLength(1);
  });
});
