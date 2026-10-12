import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';
import type { Role, User } from '@sdp/contracts';
import { signInForTest } from '@tests/support/setup.ts';
import { routes } from '@/app/routes.tsx';
import { apiError, apiStub, reply } from '@tests/support/apiStub.ts';
import { buildDataset, toListItem, type Dataset } from '@tests/support/fixtures/dataset.ts';
import { page, serveNotifications, serveReferenceData } from '@tests/support/serve.ts';

/**
 * The admin workspace, driven through the real route table.
 *
 * The server's answers are declared per test (`apiStub`); the RULES behind them
 * — who may be assigned, whether a deactivation is blocked, what scope=all
 * contains — are NestJS's and are tested in apps/api. What is proved here is
 * that the screen offers the right actions, sends the right request, and shows
 * what came back.
 *
 * The interesting assertions are the negative ones. Every row action is gated
 * by `statusMachine`, and a gate is only proved by the case it refuses.
 */

/** Holds all three roles, so `RequireWorkspace` lets them in. */
const ADMIN = 'u-charith';
/** Developer only — the negative control for the workspace guard. */
const DEVELOPER_ONLY = 'u-dheliya';

const ROLE_BY_CODE: Record<string, Role> = {
  DEVELOPER: 'Developer',
  REVIEWER: 'Reviewer',
  ADMIN: 'Admin',
  SUPER_ADMIN: 'SuperAdmin',
};

let db: Dataset;
const user = (id: string): User => {
  const found = db.users.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`No fixture user ${id}`);
  return found;
};

function renderAdmin(path = '/crp/admin') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  const router = createMemoryRouter(routes, { initialEntries: [path] });

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      {/* `Toaster` lives in `App`; mounted here so toast outcomes can be asserted. */}
      <Toaster />
    </QueryClientProvider>,
  );

  return { ...utils, router, user: userEvent.setup({ delay: null }) };
}

/**
 * The `<tr>` whose Task ID cell holds this code. Filters the grid down to the
 * code first: the grid pages at 15 and the fixtures hold more tasks than that.
 */
async function taskRow(taskCode: string) {
  const search = await screen.findByRole('searchbox', {
    name: /search tasks/i,
  });
  await userEvent.clear(search);
  await userEvent.type(search, taskCode);

  const cell = await screen.findByText(taskCode);
  const row = cell.closest('tr');
  if (row === null) throw new Error(`No row found for ${taskCode}`);
  return row;
}

beforeEach(() => {
  db = buildDataset();
  signInForTest(ADMIN);
  // Live closures over `db`: a mutation a test models is visible on refetch.
  serveReferenceData(db);
  serveNotifications(db);
  apiStub.get('/tasks', () =>
    page(db.tasks.filter((task) => task.status !== 'Draft').map((task) => toListItem(db, task))),
  );
  apiStub.get('/handovers', () => db.handovers);
  apiStub.get('/reviews', () => db.reviews);
});

describe('admin workspace guard', () => {
  it('keeps a developer-only account out of /admin', async () => {
    signInForTest(DEVELOPER_ONLY);
    const { router } = renderAdmin();

    await waitFor(() => {
      expect(router.state.location.pathname).not.toBe('/crp/admin');
    });
  });

  it('does not show a separate Role Granting tab for Super Admin', async () => {
    signInForTest({ ...user(ADMIN), roles: ['SuperAdmin'] });

    renderAdmin('/crp/admin/users');

    expect(await screen.findByText('User Management')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /role granting/i })).toBeNull();
  });
});

describe('admin tasks grid', () => {
  it('asks for scope=all and shows submitted tasks from every developer', async () => {
    // That scope=all excludes drafts and is admin-only is NestJS's rule
    // (apps/api review-tasks.service.spec "limits the Admin list…").
    renderAdmin();

    expect(await taskRow('SEMCO-013')).toBeInTheDocument();
    expect(await taskRow('BLOM-009')).toBeInTheDocument();
    expect(
      apiStub.requests('GET', '/tasks').some(({ query }) => query.get('scope') === 'all'),
    ).toBe(true);
  });

  it('offers Cancel but not Delete on a task under review', async () => {
    renderAdmin();

    const inReview = await taskRow('BLOM-010');
    expect(within(inReview).queryByRole('button', { name: /delete BLOM-010/i })).toBeNull();
    expect(within(inReview).getByRole('button', { name: /cancel BLOM-010/i })).toBeInTheDocument();
  });

  it('assigns a reviewer and moves the task into review', async () => {
    apiStub.post('/tasks/:taskId/assign', ({ params, body }) => {
      const task = db.tasks.find((candidate) => candidate.id === params['taskId'])!;
      task.reviewerId = (body as { reviewerId: string }).reviewerId;
      task.status = 'InReview';
      return toListItem(db, task);
    });
    const { user: actor } = renderAdmin();

    const row = await taskRow('BLOM-009');
    await actor.click(
      within(row).getByRole('button', {
        name: /assign a reviewer to BLOM-009/i,
      }),
    );

    await actor.click(await screen.findByRole('combobox', { name: /reviewer/i }));

    // BLOM-009 was raised by Hiruni, so the dialog must not offer Hiruni as its
    // reviewer (the server refuses SELF_REVIEW regardless).
    expect(screen.queryByRole('option', { name: 'Hiruni Wijethilaka' })).toBeNull();

    await actor.click(await screen.findByRole('option', { name: 'Pinsara Chandika' }));
    await actor.click(screen.getByRole('button', { name: /^assign reviewer$/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(apiStub.requests('POST', '/tasks/:taskId/assign')[0]?.body).toMatchObject({
      reviewerId: 'u-pinsara',
    });

    const updated = await taskRow('BLOM-009');
    await waitFor(() => {
      expect(within(updated).getByText('Pinsara Chandika')).toBeInTheDocument();
    });
    expect(within(updated).getByText('In Review')).toBeInTheDocument();
  });

  it('cancels a task after confirming', async () => {
    apiStub.post('/tasks/:taskId/cancel', ({ params }) => {
      const task = db.tasks.find((candidate) => candidate.id === params['taskId'])!;
      task.status = 'Cancelled';
      task.reviewerId = null;
      return toListItem(db, task);
    });
    const { user: actor } = renderAdmin();

    const row = await taskRow('SEMCO-013');
    await actor.click(within(row).getByRole('button', { name: /cancel SEMCO-013/i }));

    // Nothing changes until the confirmation is answered.
    expect(await screen.findByText(/cancel this task\?/i)).toBeInTheDocument();
    expect(within(row).getByText('Submitted')).toBeInTheDocument();
    expect(apiStub.requests('POST', '/tasks/:taskId/cancel')).toHaveLength(0);

    await actor.type(screen.getByRole('textbox', { name: /reason/i }), 'No longer required.');
    await actor.click(screen.getByRole('button', { name: /^cancel task$/i }));

    await waitFor(() => {
      expect(within(screen.getByRole('table')).getByText('Cancelled')).toBeInTheDocument();
    });
    expect(apiStub.requests('POST', '/tasks/:taskId/cancel')[0]?.body).toEqual({
      reason: 'No longer required.',
    });
  });
});

describe('admin users tab', () => {
  it('lets the current Super Admin transfer ownership to an existing Admin', async () => {
    const actor = user('u-qa-superadmin');
    const target = user('u-janith');
    signInForTest(actor.id);
    apiStub.post('/users/:userId/roles/transfer-super-admin', ({ params }) => {
      expect(params['userId']).toBe(target.id);
      target.roles = ['SuperAdmin'];
      actor.roles = ['Admin'];
      return target;
    });

    const { user: clicker } = renderAdmin('/crp/admin/users');
    await clicker.type(
      await screen.findByRole('searchbox', { name: /search users/i }),
      target.name,
    );
    await clicker.click(
      await screen.findByRole('button', {
        name: /transfer super admin to Janith Hasthanayake/i,
      }),
    );

    expect(
      screen.getByText(/all their other roles will be removed.*remain an admin/i),
    ).toBeInTheDocument();
    await clicker.click(screen.getByRole('button', { name: /^transfer super admin$/i }));

    expect(
      await screen.findByText('Super Admin ownership transferred to Janith Hasthanayake.'),
    ).toBeInTheDocument();
    expect(apiStub.requests('POST', '/users/:userId/roles/transfer-super-admin')).toHaveLength(1);
  });

  /**
   * Super Admin is exclusive, so a target who is also a Reviewer loses that
   * role. NestJS refuses with 409 REVIEWER_HAS_PENDING_TASKS while they still
   * hold review work; the dialog must say why and list the work.
   */
  it('blocks a transfer to a reviewer who still holds review work, and lists it', async () => {
    signInForTest('u-qa-superadmin');
    const target = user('u-pinsara');
    apiStub.post('/users/:userId/roles/transfer-super-admin', () =>
      apiError(
        409,
        'REVIEWER_HAS_PENDING_TASKS',
        `${target.name} still has 1 pending review task(s). Hand over or reassign them first.`,
        {
          tasks: [
            {
              id: 't-blom-010',
              taskCode: 'BLOM-010',
              title: 'BLOM - CRIM-1010',
              status: 'InReview',
              kind: 'InReview',
            },
          ],
        },
      ),
    );

    const { user: clicker } = renderAdmin('/crp/admin/users');
    await clicker.type(
      await screen.findByRole('searchbox', { name: /search users/i }),
      target.name,
    );
    await clicker.click(
      await screen.findByRole('button', { name: /transfer super admin to Pinsara Chandika/i }),
    );
    await clicker.click(screen.getByRole('button', { name: /^transfer super admin$/i }));

    const dialog = await screen.findByRole('dialog');
    const notice = await within(dialog).findByRole('alert');
    expect(notice).toHaveTextContent(/pending review task/i);
    expect(within(notice).getByRole('link', { name: /BLOM-010/i })).toBeInTheDocument();
    expect(within(dialog).getByText(/would lose that role as Super Admin/i)).toBeInTheDocument();
    // Nothing to retry until the work moves: confirm is switched off.
    expect(within(dialog).getByRole('button', { name: /^transfer super admin$/i })).toBeDisabled();
  });

  it('lists users and creates a new one as Invited', async () => {
    apiStub.post('/users', ({ body }) => {
      const input = body as { name: string; email: string; roles: string[] };
      const created: User = {
        id: 'u-test-person',
        name: input.name,
        email: input.email,
        roles: input.roles.map((role) => ROLE_BY_CODE[role] ?? (role as Role)),
        isActive: false,
        createdAt: new Date().toISOString(),
        status: 'INVITED',
        inviteExpiresAt: new Date(Date.now() + 24 * 3_600_000).toISOString(),
        inviteEmailStatus: 'SENT',
      };
      db.users.push(created);
      return reply(201, created);
    });
    const { user: actor } = renderAdmin('/crp/admin/users');

    expect(await screen.findByText('dheliya.kankanamge@sebsaworld.com')).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /^delete /i })).toHaveLength(0);

    await actor.click(screen.getByRole('button', { name: /add user/i }));
    expect(screen.getByRole('checkbox', { name: 'Developer' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Reviewer' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Admin' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Super Admin' })).toBeNull();
    await actor.type(await screen.findByLabelText(/name/i), 'Test Person');
    await actor.type(screen.getByLabelText(/email/i), 'test.person@sebsaworld.com');
    await actor.click(screen.getByRole('checkbox', { name: 'Reviewer' }));
    await actor.click(screen.getByRole('button', { name: /^create user$/i }));

    await actor.type(
      await screen.findByRole('searchbox', { name: /search users/i }),
      'test.person@sebsaworld.com',
    );
    expect(await screen.findByText('test.person@sebsaworld.com')).toBeInTheDocument();
    expect(apiStub.requests('POST', '/users')[0]?.body).toMatchObject({
      name: 'Test Person',
      email: 'test.person@sebsaworld.com',
    });
  });

  it('refuses to create a user with no role', async () => {
    const { user: actor } = renderAdmin('/crp/admin/users');

    await actor.click(await screen.findByRole('button', { name: /add user/i }));
    await actor.type(await screen.findByLabelText(/name/i), 'Roleless');
    await actor.type(screen.getByLabelText(/email/i), 'roleless@sebsaworld.com');
    await actor.click(screen.getByRole('button', { name: /^create user$/i }));

    expect(await screen.findByText(/select at least one role/i)).toBeInTheDocument();
    // The dialog stays open rather than silently discarding the input.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(apiStub.requests('POST', '/users')).toHaveLength(0);
  });

  it.each(['name@company', 'name@@company.com', 'name company@x.com', 'name@company.c'])(
    'rejects the malformed email %j before anything is sent',
    async (email) => {
      const { user: actor } = renderAdmin('/crp/admin/users');
      await actor.click(await screen.findByRole('button', { name: /add user/i }));
      const dialog = await screen.findByRole('dialog');
      await actor.type(within(dialog).getByLabelText(/name/i), 'Bad Email');
      await actor.type(within(dialog).getByLabelText(/email/i), email);
      await actor.tab();

      expect(
        await within(dialog).findByText(
          'Enter a valid email address, for example name@company.com',
        ),
      ).toBeInTheDocument();
      await actor.click(within(dialog).getByRole('checkbox', { name: 'Developer' }));
      await actor.click(within(dialog).getByRole('button', { name: /^create user$/i }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(apiStub.requests('POST', '/users')).toHaveLength(0);
    },
  );

  it('offers resend and revoke on an invited user, and shows the server’s answers', async () => {
    db.users.push({
      id: 'u-invite-person',
      name: 'Invite Person',
      email: 'invite.person@sebsaworld.com',
      roles: ['Reviewer'],
      isActive: false,
      createdAt: '2026-10-01T09:00:00.000Z',
      status: 'INVITED',
      inviteExpiresAt: new Date(Date.now() + 23 * 3_600_000).toISOString(),
      inviteEmailStatus: 'SENT',
    });
    // The invite only just went out, so NestJS asks the admin to wait.
    apiStub.post('/users/:userId/resend-invite', () =>
      apiError(429, 'RATE_LIMITED', 'Wait 55s before resending.'),
    );
    apiStub.post('/users/:userId/revoke-invite', ({ params }) => {
      db.users = db.users.filter((candidate) => candidate.id !== params['userId']);
      return reply(204);
    });
    const { user: actor } = renderAdmin('/crp/admin/users');

    await actor.type(
      await screen.findByRole('searchbox', { name: /search users/i }),
      'invite.person',
    );
    const row = (await screen.findByText('invite.person@sebsaworld.com')).closest('tr')!;
    expect(within(row).getByText('Invited')).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: /^(activate|deactivate)/i })).toBeNull();

    await actor.click(within(row).getByRole('button', { name: 'Resend invite for Invite Person' }));
    expect(await screen.findByText('Please wait a moment before resending.')).toBeInTheDocument();

    await actor.click(within(row).getByRole('button', { name: 'Revoke invite for Invite Person' }));
    await actor.click(await screen.findByRole('button', { name: 'Revoke invite' }));
    expect(
      await screen.findByText('Invite for invite.person@sebsaworld.com revoked.'),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText('invite.person@sebsaworld.com')).toBeNull();
    });
  });

  it('shows invite state in the Status column, with no separate Invite column', async () => {
    db.users.push({
      id: 'u-new-starter',
      name: 'New Starter',
      email: 'new.starter@sebsaworld.com',
      roles: ['Developer'],
      isActive: false,
      createdAt: '2026-10-01T09:00:00.000Z',
      status: 'INVITED',
      inviteExpiresAt: new Date(Date.now() + 23 * 3_600_000).toISOString(),
      inviteEmailStatus: 'SENT',
    });
    const { user: actor } = renderAdmin('/crp/admin/users');
    await screen.findByText('dheliya.kankanamge@sebsaworld.com');

    expect(screen.getByRole('columnheader', { name: /status/i })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /^invite$/i })).toBeNull();
    // The list pages; find the row the way an admin would.
    await actor.type(screen.getByRole('searchbox', { name: /search users/i }), 'new.starter');
    const row = (await screen.findByText('new.starter@sebsaworld.com')).closest('tr')!;
    expect(within(row).getByText('Invited')).toBeInTheDocument();
    expect(
      within(row).getByRole('button', { name: 'Resend invite for New Starter' }),
    ).toBeInTheDocument();
    expect(
      within(row).getByRole('button', { name: 'Revoke invite for New Starter' }),
    ).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: /edit New Starter/i })).toBeInTheDocument();
  });

  it('filters to invited users', async () => {
    db.users.push({
      id: 'u-waiting',
      name: 'Waiting Person',
      email: 'waiting@sebsaworld.com',
      roles: ['Developer'],
      isActive: false,
      createdAt: '2026-10-01T09:00:00.000Z',
      status: 'INVITED',
      inviteExpiresAt: null,
      inviteEmailStatus: 'SENT',
    });
    const { user: actor } = renderAdmin('/crp/admin/users');
    await screen.findByText('dheliya.kankanamge@sebsaworld.com');

    await actor.click(screen.getByRole('combobox', { name: /status/i }));
    await actor.click(await screen.findByRole('option', { name: 'Invited' }));

    expect(await screen.findByText('waiting@sebsaworld.com')).toBeInTheDocument();
    expect(screen.queryByText('dheliya.kankanamge@sebsaworld.com')).toBeNull();
    expect(screen.getByText('Showing 1 of', { exact: false })).toHaveTextContent('Showing 1 of');
  });

  it('filters by role', async () => {
    const { user: actor } = renderAdmin('/crp/admin/users');

    expect(await screen.findByText('Dheliya Kankanamge')).toBeInTheDocument();

    await actor.click(screen.getByRole('combobox', { name: /role/i }));
    await actor.click(await screen.findByRole('checkbox', { name: 'Admin' }));

    // Dheliya is Developer-only, so the Admin filter must drop them.
    await waitFor(() => {
      expect(screen.queryByText('Dheliya Kankanamge')).toBeNull();
    });
    expect(
      within(screen.getByRole('table')).getByText('Charith Widanapathirana'),
    ).toBeInTheDocument();
  });

  it('still lists every user for a Super Admin when one row breaks a write-side rule', async () => {
    signInForTest({ ...user(ADMIN), roles: ['SuperAdmin'] });
    db.users.push({
      id: 'u-mid-cleanup',
      name: 'Mid Cleanup',
      email: 'odd!address@sebsaworld.com',
      roles: [],
      isActive: false,
      createdAt: '2026-10-01T09:00:00.000Z',
      status: 'DEACTIVATED',
      inviteExpiresAt: null,
      inviteEmailStatus: null,
    });
    const { user: actor } = renderAdmin('/crp/admin/users');

    expect(await screen.findByText('Dheliya Kankanamge')).toBeInTheDocument();
    await actor.type(screen.getByRole('searchbox', { name: /search users/i }), 'mid cleanup');
    const row = (await screen.findByText('odd!address@sebsaworld.com')).closest('tr')!;
    expect(within(row).getByText('No role')).toBeInTheDocument();
  });

  it('shows the server’s reason when the user list cannot be loaded', async () => {
    apiStub.get('/users', () =>
      apiError(403, 'FORBIDDEN', 'You do not have permission to perform this action'),
    );
    renderAdmin('/crp/admin/users');

    expect(
      await screen.findByText('You do not have permission to perform this action'),
    ).toBeInTheDocument();
  });
});

describe('admin customers tab', () => {
  it('creates a customer with a chosen colour; the code comes from the server', async () => {
    apiStub.post('/customers', ({ body }) => {
      const input = body as { name: string; description: string; color: string };
      const created = { id: 'c-northwind', code: 'NORTHW', isActive: true, ...input };
      db.customers.push(created);
      return reply(201, created);
    });
    const { user: actor } = renderAdmin('/crp/admin/customers');

    expect(await screen.findByText('Semco Maritime')).toBeInTheDocument();

    await actor.click(screen.getByRole('button', { name: /add customer/i }));
    await actor.type(await screen.findByLabelText(/name/i), 'Northwind Traders');
    await actor.click(screen.getByRole('button', { name: /use teal/i }));
    await actor.click(screen.getByRole('button', { name: /^create customer$/i }));

    expect(await screen.findByText('Northwind Traders')).toBeInTheDocument();
    expect(await screen.findByText('NORTHW')).toBeInTheDocument();
    // The client never sends a code: NestJS derives it and refuses one (400).
    const sent = apiStub.requests('POST', '/customers')[0]?.body as Record<string, unknown>;
    expect(sent).not.toHaveProperty('code');
    expect(sent['color']).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('keeps the dialog open when the server refuses to delete a customer that has tasks', async () => {
    signInForTest('u-qa-superadmin');
    apiStub.delete('/customers/:customerId', () =>
      apiError(409, 'CUSTOMER_IN_USE', 'This customer has tasks. Deactivate them instead.'),
    );
    const { user: actor } = renderAdmin('/crp/admin/customers');

    // Matched on the DESCRIPTION cell: 'BLOM' is both the chip name and the code.
    const cell = await screen.findByText('Biomsterlandet');
    const row = cell.closest('tr');
    if (row === null) throw new Error('No BLOM row');

    await actor.click(within(row).getByRole('button', { name: /delete BLOM/i }));

    const confirm = await screen.findByRole('button', {
      name: /^delete customer$/i,
    });
    await actor.type(
      screen.getByRole('textbox', { name: /reason/i }),
      'Duplicate customer record.',
    );
    await actor.click(confirm);

    await waitFor(() => {
      expect(confirm).toHaveAttribute('aria-busy', 'false');
    });
    expect(apiStub.requests('DELETE', '/customers/:customerId')[0]?.body).toEqual({
      reason: 'Duplicate customer record.',
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Biomsterlandet')).toBeInTheDocument();
  });
});

describe('admin users tab: editing roles, email and reviewer workload (docs/25)', () => {
  async function openEdit(actor: ReturnType<typeof userEvent.setup>, name: string) {
    await actor.type(await screen.findByRole('searchbox', { name: /search users/i }), name);
    await actor.click(
      await screen.findByRole('button', { name: new RegExp(`^edit ${name}$`, 'i') }),
    );
    return screen.findByRole('dialog');
  }

  function serveRoleReplacement() {
    apiStub.put('/users/:userId/roles', ({ params, body }) => {
      const target = user(String(params['userId']));
      target.roles = (body as { roles: string[] }).roles.map((role) => ROLE_BY_CODE[role]!);
      return target;
    });
  }

  it('adds a role to a single-role user', async () => {
    serveRoleReplacement();
    const { user: actor } = renderAdmin('/crp/admin/users');
    const dialog = await openEdit(actor, 'Dheliya Kankanamge');

    await actor.click(within(dialog).getByRole('checkbox', { name: 'Reviewer' }));
    await actor.click(within(dialog).getByRole('button', { name: /^save changes$/i }));

    await waitFor(() => {
      expect(apiStub.requests('PUT', '/users/:userId/roles')[0]?.body).toMatchObject({
        roles: ['DEVELOPER', 'REVIEWER'],
      });
    });
  });

  it('removes one role from a user who holds two', async () => {
    db.users.push({
      id: 'u-two-roles',
      name: 'Two Roles',
      email: 'two.roles@sebsaworld.com',
      roles: ['Developer', 'Reviewer'],
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    serveRoleReplacement();
    const { user: actor } = renderAdmin('/crp/admin/users');
    const dialog = await openEdit(actor, 'Two Roles');

    await actor.click(within(dialog).getByRole('checkbox', { name: 'Reviewer' }));
    await actor.click(within(dialog).getByRole('button', { name: /^save changes$/i }));

    await waitFor(() => {
      expect(apiStub.requests('PUT', '/users/:userId/roles')[0]?.body).toMatchObject({
        roles: ['DEVELOPER'],
      });
    });
  });

  it('never lets the last remaining role be cleared', async () => {
    const { user: actor } = renderAdmin('/crp/admin/users');
    const dialog = await openEdit(actor, 'Dheliya Kankanamge');

    expect(within(dialog).getByRole('checkbox', { name: 'Developer' })).toBeDisabled();
    expect(within(dialog).queryByRole('checkbox', { name: 'Admin' })).toBeNull();
  });

  /**
   * Changing a sign-in email sends the account back to Invited: NestJS clears
   * the password, ends every session and invites the new address. The admin is
   * warned before saving, and told where the invite went.
   */
  it('warns that an email change requires a new password, and reports the invite', async () => {
    apiStub.patch('/users/:userId', ({ params, body }) => {
      const target = user(String(params['userId']));
      Object.assign(target, {
        email: (body as { email: string }).email,
        isActive: false,
        status: 'INVITED',
        inviteExpiresAt: new Date(Date.now() + 24 * 3_600_000).toISOString(),
        inviteEmailStatus: 'SENT',
      });
      return target;
    });
    const { user: actor } = renderAdmin('/crp/admin/users');
    const dialog = await openEdit(actor, 'Dheliya Kankanamge');

    const email = within(dialog).getByLabelText(/email/i);
    expect(within(dialog).queryByRole('note')).toBeNull();
    await actor.clear(email);
    await actor.type(email, 'dheliya.new@sebsaworld.com');
    expect(within(dialog).getByRole('note')).toHaveTextContent(/must set a new password/i);

    await actor.click(within(dialog).getByRole('button', { name: /^save changes$/i }));

    expect(
      await screen.findByText(
        /an invite to set a new password was sent to dheliya\.new@sebsaworld\.com/i,
      ),
    ).toBeInTheDocument();
    expect(apiStub.requests('PATCH', '/users/:userId')[0]?.body).toMatchObject({
      email: 'dheliya.new@sebsaworld.com',
    });
  });

  it('blocks deactivating a reviewer who still has review work, and lists it', async () => {
    const pending = db.tasks.find(
      (task) => task.status === 'InReview' && task.reviewerId !== null,
    )!;
    const reviewer = user(pending.reviewerId!);
    signInForTest('u-qa-superadmin');
    apiStub.patch('/users/:userId', () =>
      apiError(
        409,
        'REVIEWER_HAS_PENDING_TASKS',
        `${reviewer.name} still has 1 pending review task(s). Hand over or reassign them first.`,
        {
          tasks: [
            {
              id: pending.id,
              taskCode: pending.taskCode,
              title: pending.title,
              status: 'InReview',
              kind: 'InReview',
            },
          ],
        },
      ),
    );

    const { user: actor } = renderAdmin('/crp/admin/users');
    await actor.type(
      await screen.findByRole('searchbox', { name: /search users/i }),
      reviewer.name,
    );
    await actor.click(
      await screen.findByRole('button', { name: new RegExp(`^deactivate ${reviewer.name}$`, 'i') }),
    );
    const dialog = await screen.findByRole('dialog');
    const reason = within(dialog).queryByRole('textbox');
    if (reason !== null) await actor.type(reason, 'Leaving the team');
    await actor.click(within(dialog).getByRole('button', { name: /^deactivate$/i }));

    const notice = await within(dialog).findByRole('alert');
    expect(notice).toHaveTextContent(/still has \d+ pending review task/i);
    expect(
      within(notice).getByRole('link', { name: new RegExp(pending.taskCode, 'i') }),
    ).toBeInTheDocument();
    expect(apiStub.requests('PATCH', '/users/:userId')[0]?.body).toMatchObject({ isActive: false });
  });
});
