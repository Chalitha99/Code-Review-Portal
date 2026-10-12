import { useState } from 'react';
import * as RadixPopover from '@radix-ui/react-popover';
import * as RadixCheckbox from '@radix-ui/react-checkbox';
import { Check, ChevronDown, Users } from 'lucide-react';
import { type Role } from '@sdp/contracts';
import { cn } from '@/components/ui';
import common from '@/content/common.json';

export interface RoleMultiSelectProps {
  selectedRoles: Role[];
  onSelectedRolesChange: (roles: Role[]) => void;
  className?: string;
  'aria-label'?: string;
}

const ROLE_OPTIONS: readonly Role[] = ['Developer', 'Reviewer', 'Admin', 'SuperAdmin'];

const ROLE_LABELS: Record<Role, string> = {
  Developer: common.role.Developer,
  Reviewer: common.role.Reviewer,
  Admin: common.role.Admin,
  SuperAdmin: common.role.SuperAdmin,
};

function getRoleTriggerLabel(selectedRoles: readonly Role[]): string {
  if (selectedRoles.length === 0) {
    return 'All Roles';
  }
  if (selectedRoles.length === 1 && selectedRoles[0]) {
    return ROLE_LABELS[selectedRoles[0]];
  }
  if (selectedRoles.length === 2 && selectedRoles[0] && selectedRoles[1]) {
    return `${ROLE_LABELS[selectedRoles[0]]} + ${ROLE_LABELS[selectedRoles[1]]}`;
  }
  return `${selectedRoles.length} selected`;
}

export function RoleMultiSelect({
  selectedRoles,
  onSelectedRolesChange,
  className,
  'aria-label': ariaLabel,
}: RoleMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const popoverId = 'role-filter-options';

  const triggerLabel = getRoleTriggerLabel(selectedRoles);

  const handleToggleRole = (role: Role, nextChecked: boolean) => {
    if (nextChecked) {
      if (!selectedRoles.includes(role)) {
        onSelectedRolesChange([...selectedRoles, role]);
      }
    } else {
      onSelectedRolesChange(selectedRoles.filter((r) => r !== role));
    }
  };

  return (
    <RadixPopover.Root open={open} onOpenChange={setOpen}>
      <RadixPopover.Trigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={popoverId}
          aria-haspopup="dialog"
          aria-label={ariaLabel ?? `Role: ${triggerLabel}`}
          className={cn(
            'group inline-flex h-14 w-full min-w-0 cursor-pointer items-center justify-between gap-3 rounded-xl border bg-surface p-2.5 text-sm transition-all',
            'hover:border-line-strong hover:shadow-xs',
            'focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-violet-600',
            selectedRoles.length > 0
              ? 'border-violet-300 bg-violet-50/40 text-violet-900'
              : 'border-line text-ink-900',
            className,
          )}
        >
          <span className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
            <span
              className={cn(
                'grid size-9 shrink-0 place-items-center rounded-xl',
                selectedRoles.length > 0
                  ? 'bg-violet-100 text-violet-700'
                  : 'bg-blue-50/80 text-brand-blue-600',
              )}
              aria-hidden="true"
            >
              <Users className="size-4" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-xs font-medium text-ink-500">Roles</span>
              <span className="truncate text-sm font-semibold text-brand-blue-600">
                {triggerLabel}
              </span>
            </span>
          </span>
          <ChevronDown
            className={cn(
              'size-4 shrink-0 text-brand-blue-600 transition-transform duration-150',
              open && 'rotate-180',
            )}
            aria-hidden="true"
          />
        </button>
      </RadixPopover.Trigger>

      <RadixPopover.Portal>
        <RadixPopover.Content
          id={popoverId}
          align="start"
          sideOffset={4}
          className="z-50 w-72 animate-reveal-fade rounded-card border border-line bg-surface p-2 shadow-popover focus:outline-none"
        >
          <div className="px-2 py-1.5 text-xs font-semibold tracking-wide text-ink-500 uppercase">
            Roles
          </div>
          <div className="my-1 h-px bg-line" role="separator" />
          <div className="space-y-0.5" role="group" aria-label="Roles">
            {ROLE_OPTIONS.map((role) => {
              const isChecked = selectedRoles.includes(role);
              const id = `role-checkbox-${role}`;

              return (
                <label
                  key={role}
                  htmlFor={id}
                  className={cn(
                    'flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink-900 transition-colors select-none hover:bg-canvas',
                    isChecked && 'bg-violet-50/70',
                  )}
                >
                  <RadixCheckbox.Root
                    id={id}
                    checked={isChecked}
                    onCheckedChange={(checked) => handleToggleRole(role, checked === true)}
                    aria-label={ROLE_LABELS[role]}
                    className={cn(
                      'grid size-4 shrink-0 cursor-pointer place-items-center rounded border transition-colors',
                      'border-line-strong bg-surface',
                      'data-[state=checked]:border-violet-600 data-[state=checked]:bg-violet-600',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600',
                    )}
                  >
                    <RadixCheckbox.Indicator>
                      <Check className="size-3 text-white" aria-hidden="true" />
                    </RadixCheckbox.Indicator>
                  </RadixCheckbox.Root>
                  <span className="flex-1 cursor-pointer font-medium select-none">
                    {ROLE_LABELS[role]}
                  </span>
                </label>
              );
            })}
          </div>

          {selectedRoles.length > 0 ? (
            <>
              <div className="my-1 h-px bg-line" role="separator" />
              <button
                type="button"
                onClick={() => onSelectedRolesChange([])}
                className="w-full cursor-pointer rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-brand-blue-600 transition-colors hover:bg-brand-blue-50/60 hover:text-brand-blue-700"
              >
                Clear roles
              </button>
            </>
          ) : null}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}
