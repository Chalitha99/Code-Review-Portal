import { useState } from 'react';
import { toast } from 'sonner';
import {
  MAX_EMAIL_LENGTH,
  ROLES,
  createUserInputSchema,
  emailAddressSchema,
  type PendingReviewTask,
  type Role,
  type User,
} from '@sdp/contracts';
import { Button } from '@/components/ui/Button.tsx';
import { Checkbox, Textarea } from '@/components/ui/controls.tsx';
import { Dialog } from '@/components/ui/Dialog.tsx';
import { Field, Input } from '@/components/ui/Field.tsx';
import { ApiError } from '@/lib/apiClient.ts';
import { interpolate } from '@/lib/formatters.ts';
import admin from '@/content/admin.json';
import common from '@/content/common.json';
import { useCreateUser, useReplaceUserRoles, useUpdateUser } from '../api/queries.ts';
import { PendingReviewTasksNotice } from './PendingReviewTasksNotice.tsx';
import { pendingReviewTasksFrom } from './pendingReviewTasks.ts';

/**
 * Add User (screen 02's modal) and Edit User, which is the same three fields.
 *
 * One component rather than two: the fields, the validation and the role
 * checkboxes are identical, and the only difference is which mutation runs and
 * what the buttons say. Two dialogs would be two places for the role list to
 * drift.
 *
 * Validation is `createUserInputSchema` from `@sdp/contracts` — the same schema
 * the handler parses, so a message shown here is the message the server would
 * give. Creating a user does not set a password: the server makes the account
 * INVITED and emails a one-time link to the set-password screen.
 *
 * Editing saves the profile (PATCH /users/:id) and, only when the role set
 * changed, the complete new set (PUT /users/:id/roles) — roles can be added, or
 * removed from a user who holds more than one.
 */

interface FormState {
  name: string;
  email: string;
  roles: Role[];
  reason: string;
}

const EMPTY: FormState = { name: '', email: '', roles: [], reason: '' };

/** Granting or removing these needs a written reason (kept in the audit log). */
const PRIVILEGED_ROLES: readonly Role[] = ['Admin', 'SuperAdmin'];

function sameRoles(a: readonly Role[], b: readonly Role[]): boolean {
  return a.length === b.length && a.every((role) => b.includes(role));
}

/**
 * Mounted only while open, and keyed on the subject by the caller.
 *
 * That is what lets the form seed itself in `useState` instead of copying props
 * into state from an effect. Seeding via an effect is the pattern that already
 * cost this codebase a bug on the review form — a refetch re-ran it and
 * discarded what the user had typed.
 */
export function UserFormDialog({
  user,
  onClose,
  availableRoles = ['Developer', 'Reviewer'],
  editRoles = true,
}: {
  /** `null` creates; a user edits that user. */
  user: User | null;
  onClose: () => void;
  /** Roles the signed-in admin may grant or revoke (Admin only for a Super Admin). */
  availableRoles?: readonly Role[];
  /** `false` for the Super Admin account, whose role changes only through Transfer. */
  editRoles?: boolean;
}) {
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const replaceRoles = useReplaceUserRoles();

  const [form, setForm] = useState<FormState>(() =>
    user === null
      ? EMPTY
      : { name: user.name, email: user.email, roles: [...user.roles], reason: '' },
  );
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [pendingTasks, setPendingTasks] = useState<PendingReviewTask[] | null>(null);

  const isPending = createUser.isPending || updateUser.isPending || replaceRoles.isPending;
  const rolesChanged = user !== null && editRoles && !sameRoles(user.roles, form.roles);
  const privilegedChange =
    user === null
      ? form.roles.some((role) => PRIVILEGED_ROLES.includes(role))
      : rolesChanged &&
        PRIVILEGED_ROLES.some((role) => user.roles.includes(role) !== form.roles.includes(role));

  async function submit() {
    if (privilegedChange && form.reason.trim() === '') {
      setErrors((current) => ({ ...current, reason: admin.users.privileged.reasonRequired }));
      return;
    }
    const parsed = createUserInputSchema.safeParse(form);
    if (!parsed.success) {
      const next: Partial<Record<keyof FormState, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === 'name' || key === 'email' || key === 'roles' || key === 'reason') {
          next[key] ??= issue.message;
        }
      }
      setErrors(next);
      return;
    }

    const reason = privilegedChange ? form.reason.trim() : undefined;
    const onError = (cause: unknown) => {
      const blocking = pendingReviewTasksFrom(cause);
      if (blocking !== null) {
        setPendingTasks(blocking);
        return;
      }
      toast.error(cause instanceof ApiError ? cause.message : common.errors.generic);
    };

    if (user === null) {
      try {
        const created = await createUser.mutateAsync({
          name: parsed.data.name,
          email: parsed.data.email,
          roles: parsed.data.roles,
          ...(reason === undefined ? {} : { reason }),
        });
        toast.success(
          interpolate(admin.users.created, { name: created.name, email: created.email }),
        );
        onClose();
      } catch (cause) {
        onError(cause);
      }
      return;
    }

    try {
      let updated = user;
      const emailChanged = parsed.data.email.toLowerCase() !== user.email.toLowerCase();
      if (parsed.data.name !== user.name || parsed.data.email !== user.email) {
        updated = await updateUser.mutateAsync({
          userId: user.id,
          input: { name: parsed.data.name, email: parsed.data.email },
        });
      }
      if (rolesChanged) {
        updated = await replaceRoles.mutateAsync({
          userId: user.id,
          roles: parsed.data.roles,
          ...(reason === undefined ? {} : { reason }),
        });
      }
      toast.success(
        emailChanged
          ? interpolate(admin.users.emailChange.success, {
              name: updated.name,
              email: updated.email,
            })
          : interpolate(admin.users.updated, { name: updated.name }),
      );
      onClose();
    } catch (cause) {
      onError(cause);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={user === null ? admin.users.addTitle : admin.users.editTitle}
      description={user === null ? admin.users.addSubtitle : admin.users.editSubtitle}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {common.actions.cancel}
          </Button>
          <Button variant="adminPrimary" onClick={() => void submit()} isLoading={isPending}>
            {user === null
              ? isPending
                ? admin.users.creating
                : admin.users.create
              : isPending
                ? admin.users.saving
                : admin.users.save}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={admin.users.nameLabel} required error={errors.name}>
          <Input
            value={form.name}
            onChange={(event) => {
              setForm({ ...form, name: event.target.value });
            }}
            placeholder={admin.users.namePlaceholder}
          />
        </Field>

        <Field label={admin.users.emailLabel} required error={errors.email}>
          <Input
            type="email"
            inputMode="email"
            autoComplete="off"
            maxLength={MAX_EMAIL_LENGTH + 1}
            value={form.email}
            onChange={(event) => {
              setForm({ ...form, email: event.target.value });
              setErrors((current) => {
                const { email: _email, ...remaining } = current;
                return remaining;
              });
            }}
            onBlur={() => {
              if (form.email.trim() === '') return;
              const message = emailAddressSchema.safeParse(form.email).error?.issues[0]?.message;
              if (message !== undefined) setErrors((current) => ({ ...current, email: message }));
            }}
            placeholder={admin.users.emailPlaceholder}
          />
        </Field>
        {user !== null && form.email.trim().toLowerCase() !== user.email.toLowerCase() ? (
          // The server sends the account back to Invited: the new address must
          // be proven before it can sign in or receive password resets.
          <p
            role="note"
            className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
          >
            {interpolate(admin.users.emailChange.warning, { name: user.name })}
          </p>
        ) : null}

        {user !== null && !editRoles ? null : (
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink-900">
              {admin.users.rolesLabel}
            </legend>
            <div className="flex flex-wrap gap-4">
              {ROLES.filter((role) => availableRoles.includes(role)).map((role) => {
                const checked = form.roles.includes(role);
                // A user always keeps at least one role; the last one cannot be cleared.
                const isLastRole = checked && form.roles.length === 1 && user !== null;
                return (
                  <Checkbox
                    key={role}
                    label={common.role[role]}
                    checked={checked}
                    disabled={isLastRole}
                    onCheckedChange={(next) => {
                      setPendingTasks(null);
                      setForm({
                        ...form,
                        roles: next
                          ? [...form.roles, role]
                          : form.roles.filter((current) => current !== role),
                      });
                    }}
                  />
                );
              })}
            </div>
            {errors.roles === undefined ? null : (
              <p role="alert" className="mt-2 text-xs font-medium text-danger">
                {errors.roles}
              </p>
            )}
          </fieldset>
        )}

        {privilegedChange ? (
          <Field
            label={admin.users.privileged.roleReasonLabel}
            hint={admin.users.privileged.roleReasonHint}
            required
            error={errors.reason}
          >
            <Textarea
              value={form.reason}
              onChange={(event) => {
                setForm({ ...form, reason: event.target.value });
                setErrors((current) => {
                  const { reason: _reason, ...remaining } = current;
                  return remaining;
                });
              }}
              rows={3}
              placeholder={admin.users.privileged.roleReasonPlaceholder}
            />
          </Field>
        ) : null}

        {pendingTasks !== null && user !== null ? (
          <PendingReviewTasksNotice name={user.name} tasks={pendingTasks} />
        ) : null}
      </div>
    </Dialog>
  );
}
