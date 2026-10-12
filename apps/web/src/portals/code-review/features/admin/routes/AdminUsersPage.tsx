import { useCallback, useMemo, useState } from 'react';
import {
  Filter,
  KeyRound,
  Lock,
  Mail,
  MailX,
  Pencil,
  Power,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users as UsersIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { type PendingReviewTask, type Role, type User } from '@sdp/contracts';
import { RoleBadges } from '@/portals/code-review/components/badges.tsx';
import { ConfirmDialog } from '@/components/common/ConfirmDialog.tsx';
import { DataTable } from '@/components/common/DataTable.tsx';
import { columnHelper, type ColumnList } from '@/components/common/dataTableColumns.ts';
import { EmptyState } from '@/components/common/states.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { IconButton, SearchField } from '@/components/ui/controls.tsx';
import { Textarea } from '@/components/ui/controls.tsx';
import { Field } from '@/components/ui/Field.tsx';
import { Select, type SelectOption } from '@/components/ui/Select.tsx';
import { Tooltip } from '@/components/ui/Tooltip.tsx';
import { FilterResetButton } from '@/portals/code-review/components/TaskFilterBar.tsx';
import { ALL } from '@/portals/code-review/components/taskFilters.ts';
import { ApiError } from '@/lib/apiClient.ts';
import { isPrivilegedRoleSet } from '@/lib/permissions.ts';
import { useCurrentUser } from '@/hooks/useCurrentUser.ts';
import { interpolate } from '@/lib/formatters.ts';
import admin from '@/content/admin.json';
import common from '@/content/common.json';
import { useDeleteUser, useTransferSuperAdmin, useUpdateUser, useUsers } from '../api/queries.ts';
import { UserFormDialog } from '../components/UserFormDialog.tsx';
import { PendingReviewTasksNotice } from '../components/PendingReviewTasksNotice.tsx';
import { pendingReviewTasksFrom } from '../components/pendingReviewTasks.ts';
import { EmptyIllustration } from '@/components/common/EmptyIllustration.tsx';
import { userKeys } from '@/portals/code-review/hooks/useUsers.ts';
import { RoleMultiSelect } from '../components/RoleMultiSelect.tsx';
// Temporary local-auth (invite) UI: the status pill and the
// Resend / Revoke actions. Remove with `features/local-auth` when SSO arrives.
import { StatusPill } from '@/features/local-auth/admin/InviteCells.tsx';
import { userStatus } from '@/features/local-auth/admin/inviteDisplay.ts';
import {
  useResendInvite,
  useRevokeInvite,
  useSendResetLink,
} from '@/features/local-auth/admin/useInviteActions.ts';
import { invite as inviteCopy } from '@/features/local-auth/content.ts';

/**
 * Admin — Users (screen 02).
 *
 * Row actions, matching the wireframe: edit, activate/deactivate, delete, plus
 * Transfer Super Admin. Deactivate is the everyday one; delete is a Super Admin
 * soft delete that keeps the record for the audit trail and Reports.
 *
 * The server owns every rule (role policy, Super Admin exclusivity, a reviewer
 * with pending review work cannot be deactivated — docs/25). The page only hides
 * what the actor may not do and shows the server's reason when it refuses.
 */

const helper = columnHelper<User>();
const labels = admin.users.columns;

const STATUS_OPTIONS: SelectOption[] = [
  { value: ALL, label: 'All Statuses' },
  { value: 'active', label: admin.users.statusActive },
  { value: 'invited', label: admin.users.statusInvited },
  { value: 'inactive', label: admin.users.statusInactive },
];

/*
 * Each column is its own `const`, as in `taskColumns.tsx`.
 *
 * Assembling them inline in one array literal collapses TanStack's tuple
 * inference and every `cell` callback silently receives `any` — which typecheck
 * accepts and only `no-unsafe-assignment` catches.
 */

const nameColumn = helper.accessor('name', {
  header: labels.name,
  cell: (context) => (
    <span className="text-sm font-semibold text-ink-900">{context.getValue()}</span>
  ),
});

const emailColumn = helper.accessor('email', {
  header: labels.email,
  cell: (context) => <span className="text-ink-600 text-sm font-normal">{context.getValue()}</span>,
});

const rolesColumn = helper.accessor('roles', {
  header: labels.roles,
  cell: (context) => <RoleBadges roles={context.getValue()} />,
});

const inviteStatusColumn = helper.display({
  id: 'inviteStatus',
  header: labels.status,
  cell: (context) => <StatusPill user={context.row.original} />,
});

export function AdminUsersPage() {
  const { data: actor } = useCurrentUser();
  const { data: users, isPending, isFetching, error, refetch } = useUsers();
  // Destructured because `mutate` is referentially stable while the mutation
  // object is not — which is what lets the column definitions memoise honestly
  // instead of being pinned with a lint suppression.
  const { mutate: mutateUser, isPending: isUpdating } = useUpdateUser();
  const deleteUser = useDeleteUser();
  const transferSuperAdmin = useTransferSuperAdmin();
  const { mutate: mutateResend, isPending: isResending } = useResendInvite(userKeys.all);
  const revokeInvite = useRevokeInvite(userKeys.all);
  const { mutate: mutateResetLink, isPending: isSendingReset } = useSendResetLink();
  const [revoking, setRevoking] = useState<User | null>(null);

  const [search, setSearch] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<Role[]>([]);
  const [status, setStatus] = useState(ALL);

  const [editing, setEditing] = useState<User | null>(null);
  const [isFormOpen, setFormOpen] = useState(false);
  const [statusChanging, setStatusChanging] = useState<{ user: User; isActive: boolean } | null>(
    null,
  );
  const [deleting, setDeleting] = useState<User | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [transferring, setTransferring] = useState<User | null>(null);
  /** Tasks the server says block the open deactivate/delete dialog. */
  const [blockingTasks, setBlockingTasks] = useState<PendingReviewTask[] | null>(null);

  // Super Admin is an exclusive role that holds every Admin capability. Admins
  // manage Developer and Reviewer accounts; only the Super Admin manages Admins.
  const isSuperAdmin = actor?.roles.includes('SuperAdmin') === true;
  const assignableRoles: readonly Role[] = isSuperAdmin
    ? ['Developer', 'Reviewer', 'Admin']
    : ['Developer', 'Reviewer'];
  const canManage = useCallback(
    (user: User) => isSuperAdmin || !isPrivilegedRoleSet(user.roles),
    [isSuperAdmin],
  );

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return (users ?? []).filter((user) => {
      // MATCH ALL: User must have every single selected role
      if (selectedRoles.length > 0 && !selectedRoles.every((role) => user.roles.includes(role))) {
        return false;
      }
      const current = userStatus(user);
      if (status === 'active' && current !== 'ACTIVE') return false;
      if (status === 'invited' && current !== 'INVITED') return false;
      if (status === 'inactive' && current !== 'DEACTIVATED') return false;
      if (needle === '') return true;
      return user.name.toLowerCase().includes(needle) || user.email.toLowerCase().includes(needle);
    });
  }, [users, search, selectedRoles, status]);

  const handleClearFilters = useCallback(() => {
    setSearch('');
    setSelectedRoles([]);
    setStatus(ALL);
  }, []);

  const isFiltered = search.trim() !== '' || selectedRoles.length > 0 || status !== ALL;
  const resetPageTrigger = `${search}:${selectedRoles.slice().sort().join(',')}:${status}`;

  const setActive = useCallback(
    (user: User, isActive: boolean, actionReason?: string) => {
      mutateUser(
        { userId: user.id, input: { isActive, ...(actionReason ? { reason: actionReason } : {}) } },
        {
          onSuccess: () => {
            toast.success(
              interpolate(
                isActive ? admin.users.activate.success : admin.users.deactivate.success,
                { name: user.name },
              ),
            );
            setStatusChanging(null);
            setReason('');
            setBlockingTasks(null);
          },
          onError: (cause) => {
            const blocking = pendingReviewTasksFrom(cause);
            if (blocking !== null) {
              setBlockingTasks(blocking);
              return;
            }
            toast.error(cause instanceof ApiError ? cause.message : common.errors.generic);
          },
        },
      );
    },
    [mutateUser],
  );

  const columns = useMemo<ColumnList<User>>(
    () => [
      nameColumn,
      emailColumn,
      rolesColumn,
      inviteStatusColumn,
      helper.display({
        id: 'actions',
        header: '',
        cell: (context) => {
          const user = context.row.original;
          const privileged = isPrivilegedRoleSet(user.roles);
          const mayManage = canManage(user);
          // An invited user has never signed in: Revoke replaces Deactivate.
          const isInvited = userStatus(user) === 'INVITED';
          return (
            <div className="flex items-center justify-end gap-1.5">
              {!mayManage ? (
                <Tooltip content="This account can only be managed by a Super Admin.">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium text-ink-500 select-none"
                    aria-label="Protected: this account can only be managed by a Super Admin"
                  >
                    <Lock className="size-3 text-ink-400" aria-hidden="true" />
                    <span>Protected</span>
                  </button>
                </Tooltip>
              ) : null}
              {mayManage && isInvited ? (
                <>
                  <IconButton
                    label={interpolate(inviteCopy.resendAction, { name: user.name })}
                    icon={<Mail className="size-4" />}
                    size="sm"
                    disabled={isResending}
                    onClick={() => {
                      mutateResend(user.id, {
                        onSuccess: (sent) => {
                          if (sent.emailStatus === 'FAILED')
                            toast.warning(inviteCopy.resentEmailFailed);
                          else
                            toast.success(
                              interpolate(inviteCopy.resent, {
                                email: user.email,
                                expiresAt: new Date(sent.expiresAt).toLocaleString(undefined, {
                                  dateStyle: 'medium',
                                  timeStyle: 'short',
                                }),
                              }),
                            );
                        },
                        onError: (cause) => {
                          toast.error(
                            cause instanceof ApiError && cause.code === 'RATE_LIMITED'
                              ? inviteCopy.rateLimited
                              : cause instanceof ApiError && cause.code === 'NOT_INVITED'
                                ? inviteCopy.notInvited
                                : inviteCopy.generic,
                          );
                        },
                      });
                    }}
                  />
                  <IconButton
                    label={interpolate(inviteCopy.revokeAction, { name: user.name })}
                    icon={<MailX className="size-4" />}
                    tone="danger"
                    size="sm"
                    onClick={() => {
                      setRevoking(user);
                    }}
                  />
                </>
              ) : null}
              {mayManage && userStatus(user) === 'ACTIVE' && user.id !== actor?.id ? (
                <IconButton
                  label={interpolate(inviteCopy.resetAction, { name: user.name })}
                  icon={<KeyRound className="size-4" />}
                  size="sm"
                  disabled={isSendingReset}
                  onClick={() => {
                    mutateResetLink(user.id, {
                      onSuccess: (sent) => {
                        if (sent.emailStatus === 'FAILED')
                          toast.warning(inviteCopy.resetEmailFailed);
                        else
                          toast.success(interpolate(inviteCopy.resetSent, { email: user.email }));
                      },
                      onError: (cause) => {
                        toast.error(
                          cause instanceof ApiError && cause.code === 'RATE_LIMITED'
                            ? inviteCopy.rateLimited
                            : cause instanceof ApiError && cause.code === 'NOT_ACTIVE'
                              ? inviteCopy.notActive
                              : inviteCopy.generic,
                        );
                      },
                    });
                  }}
                />
              ) : null}
              {mayManage ? (
                <IconButton
                  label={interpolate(admin.users.actions.edit, { name: user.name })}
                  icon={<Pencil className="size-4" />}
                  size="sm"
                  onClick={() => {
                    setEditing(user);
                    setFormOpen(true);
                  }}
                />
              ) : null}
              {mayManage && !isInvited ? (
                <IconButton
                  label={interpolate(
                    user.isActive ? admin.users.actions.deactivate : admin.users.actions.activate,
                    { name: user.name },
                  )}
                  icon={<Power className="size-4" />}
                  tone={user.isActive ? 'danger' : 'success'}
                  size="sm"
                  onClick={() => {
                    if (user.isActive || privileged) {
                      setReason('');
                      setReasonError(undefined);
                      setBlockingTasks(null);
                      setStatusChanging({ user, isActive: !user.isActive });
                    } else setActive(user, true);
                  }}
                />
              ) : null}
              {isSuperAdmin &&
              user.isActive &&
              user.id !== actor?.id &&
              user.roles.includes('Admin') &&
              !user.roles.includes('SuperAdmin') ? (
                <IconButton
                  label={interpolate(admin.users.actions.transferSuperAdmin, {
                    name: user.name,
                  })}
                  icon={<ShieldCheck className="size-4" />}
                  size="sm"
                  onClick={() => {
                    setBlockingTasks(null);
                    setTransferring(user);
                  }}
                />
              ) : null}
              {isSuperAdmin && mayManage && user.id !== actor?.id && !isInvited ? (
                <IconButton
                  label={interpolate(admin.users.actions.delete, { name: user.name })}
                  icon={<Trash2 className="size-4" />}
                  tone="danger"
                  size="sm"
                  onClick={() => {
                    setReason('');
                    setReasonError(undefined);
                    setBlockingTasks(null);
                    setDeleting(user);
                  }}
                />
              ) : null}
            </div>
          );
        },
      }),
    ],
    [
      actor?.id,
      canManage,
      isSuperAdmin,
      setActive,
      mutateResend,
      isResending,
      mutateResetLink,
      isSendingReset,
    ],
  );

  return (
    <section aria-labelledby="admin-users-heading">
      <h2 id="admin-users-heading" className="sr-only">
        {admin.users.title}
      </h2>

      <DataTable
        data={visible}
        columns={columns}
        getRowId={(user) => user.id}
        totalCount={users?.length ?? 0}
        countNoun={admin.users.noun}
        caption={admin.users.caption}
        isLoading={isPending}
        isFetching={isFetching}
        error={error}
        onRetry={() => {
          void refetch();
        }}
        pageSize={15}
        alwaysShowPagination
        resetPageIndexTrigger={resetPageTrigger}
        toolbar={
          <div className="flex w-full flex-col gap-3.5">
            {/* Row 1: Search receives majority space, Add User is primary CTA */}
            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <SearchField
                  value={search}
                  onValueChange={setSearch}
                  label={admin.users.searchLabel}
                  placeholder={admin.users.searchPlaceholder}
                />
              </div>
              <Button
                variant="adminPrimary"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
                className="w-full shrink-0 sm:w-auto"
              >
                <UserPlus className="size-4" aria-hidden="true" />
                {admin.users.add}
              </Button>
            </div>

            {/* Row 2: Task-filter-style controls, with balanced widths. */}
            <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(18rem,24rem)_minmax(13rem,16rem)_auto]">
              <div className="min-w-0">
                <RoleMultiSelect
                  selectedRoles={selectedRoles}
                  onSelectedRolesChange={setSelectedRoles}
                />
              </div>
              <div className="min-w-0">
                <Select
                  value={status}
                  onValueChange={setStatus}
                  options={STATUS_OPTIONS}
                  label="Status"
                  icon={<Filter className="size-4" />}
                  variant="stacked"
                  aria-label={admin.users.statusAll}
                />
              </div>
              <FilterResetButton
                isFiltered={isFiltered}
                onReset={handleClearFilters}
                className="w-full lg:w-auto"
              />
            </div>

            <div className="flex min-h-5 items-center gap-1.5 text-xs font-medium text-ink-500 select-none">
              <span>
                Showing {visible.length} of {users?.length ?? 0} users
              </span>
              {isFiltered ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-violet-700">Filtered</span>
                </>
              ) : null}
            </div>
          </div>
        }
        filteredEmptyState={
          <EmptyState
            icon={
              <EmptyIllustration>
                <UsersIcon />
              </EmptyIllustration>
            }
            title={admin.users.emptyFilteredTitle}
            hint={admin.users.emptyFilteredHint}
            action={
              <Button variant="secondary" onClick={handleClearFilters}>
                {admin.users.clearFilters}
              </Button>
            }
          />
        }
        emptyState={
          <EmptyState
            icon={
              <EmptyIllustration>
                <UsersIcon />
              </EmptyIllustration>
            }
            title={admin.users.emptyTitle}
            hint={admin.users.emptyHint}
          />
        }
      />

      {isFormOpen ? (
        <UserFormDialog
          key={editing?.id ?? 'new'}
          user={editing}
          availableRoles={assignableRoles}
          // The Super Admin's role set changes only through Transfer.
          editRoles={editing?.roles.includes('SuperAdmin') !== true}
          onClose={() => {
            setFormOpen(false);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) setRevoking(null);
        }}
        title={inviteCopy.revokeTitle}
        description={interpolate(inviteCopy.revokeText, { name: revoking?.name ?? '' })}
        confirmLabel={inviteCopy.revokeConfirm}
        isPending={revokeInvite.isPending}
        onConfirm={() => {
          if (revoking === null) return;
          const target = revoking;
          revokeInvite.mutate(target.id, {
            onSuccess: () => {
              toast.success(interpolate(inviteCopy.revoked, { email: target.email }));
              setRevoking(null);
            },
            onError: (cause) => {
              toast.error(
                cause instanceof ApiError && cause.code === 'NOT_INVITED'
                  ? inviteCopy.notInvited
                  : inviteCopy.generic,
              );
              setRevoking(null);
            },
          });
        }}
      />

      <ConfirmDialog
        open={statusChanging !== null}
        onOpenChange={(open) => {
          if (!open) setStatusChanging(null);
        }}
        title={
          statusChanging?.isActive === true
            ? admin.users.actions.activate.replace('{name}', statusChanging.user.name)
            : admin.users.deactivate.title
        }
        description={interpolate(admin.users.deactivate.description, {
          name: statusChanging?.user.name ?? '',
        })}
        confirmLabel={
          statusChanging?.isActive === true
            ? admin.users.statusActive
            : admin.users.deactivate.confirm
        }
        isPending={isUpdating}
        onConfirm={() => {
          if (statusChanging === null) return;
          const privileged = isPrivilegedRoleSet(statusChanging.user.roles);
          if (privileged && reason.trim() === '') {
            setReasonError(admin.users.privileged.reasonRequired);
            return;
          }
          setActive(statusChanging.user, statusChanging.isActive, reason.trim());
        }}
      >
        {statusChanging !== null && isPrivilegedRoleSet(statusChanging.user.roles) ? (
          <Field
            label={admin.users.privileged.statusReasonLabel}
            hint={admin.users.privileged.statusReasonHint}
            required
            error={reasonError}
          >
            <Textarea
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setReasonError(undefined);
              }}
              rows={3}
              placeholder={admin.users.privileged.statusReasonPlaceholder}
            />
          </Field>
        ) : null}
        {statusChanging !== null && blockingTasks !== null ? (
          <PendingReviewTasksNotice name={statusChanging.user.name} tasks={blockingTasks} />
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={admin.users.delete.title}
        description={interpolate(admin.users.delete.description, { name: deleting?.name ?? '' })}
        confirmLabel={admin.users.delete.confirm}
        isPending={deleteUser.isPending}
        onConfirm={() => {
          if (deleting === null) return;
          if (reason.trim() === '') {
            setReasonError(admin.users.privileged.reasonRequired);
            return;
          }
          const user = deleting;

          deleteUser.mutate(
            { userId: user.id, reason: reason.trim() },
            {
              onSuccess: () => {
                toast.success(interpolate(admin.users.delete.success, { name: user.name }));
                setDeleting(null);
                setReason('');
              },
              onError: (cause) => {
                const blocking = pendingReviewTasksFrom(cause);
                if (blocking !== null) {
                  setBlockingTasks(blocking);
                  return;
                }
                toast.error(cause instanceof ApiError ? cause.message : common.errors.generic);
              },
            },
          );
        }}
      >
        <Field label={admin.users.delete.reasonLabel} required error={reasonError}>
          <Textarea
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              setReasonError(undefined);
            }}
            rows={3}
            placeholder={admin.users.delete.reasonPlaceholder}
          />
        </Field>
        {deleting !== null && blockingTasks !== null ? (
          <PendingReviewTasksNotice name={deleting.name} tasks={blockingTasks} />
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={transferring !== null}
        onOpenChange={(open) => {
          if (!open) setTransferring(null);
        }}
        title={admin.users.transferSuperAdmin.title}
        description={interpolate(admin.users.transferSuperAdmin.description, {
          name: transferring?.name ?? '',
        })}
        confirmLabel={admin.users.transferSuperAdmin.confirm}
        tone="primary"
        isPending={transferSuperAdmin.isPending}
        // Super Admin is exclusive, so a Reviewer target loses that role: the
        // server refuses while they still hold review work. Confirm stays off
        // until the dialog is reopened after the work is reassigned.
        confirmDisabled={transferring !== null && blockingTasks !== null}
        onConfirm={() => {
          if (transferring === null) return;
          const user = transferring;
          transferSuperAdmin.mutate(user.id, {
            onSuccess: () => {
              toast.success(
                interpolate(admin.users.transferSuperAdmin.success, { name: user.name }),
              );
              setTransferring(null);
            },
            onError: (cause) => {
              const blocking = pendingReviewTasksFrom(cause);
              if (blocking !== null) {
                setBlockingTasks(blocking);
                return;
              }
              toast.error(cause instanceof ApiError ? cause.message : common.errors.generic);
            },
          });
        }}
      >
        {transferring !== null && blockingTasks !== null ? (
          <>
            <p className="text-sm text-ink-700">
              {interpolate(admin.users.transferSuperAdmin.blocked, { name: transferring.name })}
            </p>
            <PendingReviewTasksNotice name={transferring.name} tasks={blockingTasks} />
          </>
        ) : null}
      </ConfirmDialog>
    </section>
  );
}
