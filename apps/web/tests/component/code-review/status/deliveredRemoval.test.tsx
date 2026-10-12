import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { TASK_STATUSES } from '@sdp/contracts';
import { apiStub } from '@tests/support/apiStub.ts';
import { buildDataset, toListItem } from '@tests/support/fixtures/dataset.ts';
import { serveReferenceData } from '@tests/support/serve.ts';
import { useSession } from '@/hooks/useSession.ts';
import common from '@/content/common.json';
import { countText, renderApp, USERS } from '@tests/support/renderApp.tsx';

const SEMCO_DEVELOPER = 'u-udari';

// Same as adminReports.test.tsx: the lazy Reports route pulls in Recharts, whose cold
// transform can outlast a `findBy` budget under a full parallel run.
beforeAll(async () => {
  await import('@/portals/code-review/features/reports/routes/AdminReportsPage.tsx');
}, 60_000);

async function statusOptions(user: ReturnType<typeof renderApp>['user']): Promise<string[]> {
  await user.click(await screen.findByRole('combobox', { name: /^status$/i }));
  const options = (await screen.findAllByRole('option')).map((o) => o.textContent.trim());
  await user.keyboard('{Escape}');
  return options;
}

/**
 * "Delivered" was retired from Code Review. That the API never sends it (a
 * legacy row reads as Approved) is tested in apps/api review-tasks.service.spec
 * ("legacy statuses"); this file checks the screens offer no trace of it.
 */
const db = buildDataset();

beforeEach(() => {
  serveReferenceData(db);
  const me = () => useSession.getState().userId;
  apiStub.get('/tasks', ({ query }) => {
    const scope = query.get('scope');
    const rows =
      scope === 'all'
        ? db.tasks.filter((task) => task.status !== 'Draft')
        : db.tasks.filter((task) => task.developerId === me());
    return {
      items: rows.map((task) => toListItem(db, task)),
      pagination: { page: 1, pageSize: rows.length, total: rows.length },
    };
  });
  apiStub.get('/reviews', () => db.reviews);
  apiStub.get('/handovers', () => db.handovers);
});

function approvedCount(tasks: typeof db.tasks): number {
  return tasks.filter((task) => task.status === 'Approved').length;
}

describe('status filters offer only Code Review statuses', () => {
  it('My Tasks lists every status and no Delivered', async () => {
    const { user } = renderApp('/crp/developer');
    const options = await statusOptions(user);
    expect(options.slice(1)).toEqual(TASK_STATUSES.map((s) => common.status[s]));
  });

  it('Admin Tasks lists every non-Draft status and no Delivered', async () => {
    const { user } = renderApp('/crp/admin', USERS.adminOnly);
    const options = await statusOptions(user);
    expect(options.slice(1)).toEqual(
      TASK_STATUSES.filter((s) => s !== 'Draft').map((s) => common.status[s]),
    );
  });

  it('Admin Reports offers no Delivered or Status filter and shows four status count cards', async () => {
    renderApp('/crp/admin/reports', USERS.adminOnly);
    expect(screen.queryByRole('combobox', { name: /^status$/i })).not.toBeInTheDocument();

    const page = await screen.findByRole('region', { name: 'Reports & Analytics' });
    const captions = [
      /^All review tasks$/,
      /approval rate$/,
      /^Pending revisions$/,
      /^Tasks cancelled$/,
    ];
    for (const caption of captions) {
      expect(await within(page).findByText(caption)).toBeInTheDocument();
    }
    expect(within(page).queryByText(/of which delivered/i)).not.toBeInTheDocument();
  });
});

describe('approved counts agree across roles', () => {
  it('counts the formerly Delivered task as Approved for its developer and for Admin', async () => {
    const own = db.tasks.filter((t) => t.developerId === SEMCO_DEVELOPER);
    const first = renderApp('/crp/developer', SEMCO_DEVELOPER);
    const devCard = await screen.findByRole('button', { name: /show only approved/i });
    expect(devCard).toHaveTextContent(countText(approvedCount(own)));
    first.unmount();

    renderApp('/crp/admin', USERS.adminOnly);
    const adminCard = await screen.findByRole('button', { name: /show only approved/i });
    expect(adminCard).toHaveTextContent(
      countText(approvedCount(db.tasks.filter((task) => task.status !== 'Draft'))),
    );
  });
});
