import { useState } from 'react';
import { Check } from 'lucide-react';
import { toast } from 'sonner';
import { createCustomerInputSchema, type Customer } from '@sdp/contracts';
import { cn } from '@/components/ui';
import { CustomerChip } from '@/portals/code-review/components/badges.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { Textarea } from '@/components/ui/controls.tsx';
import { Dialog } from '@/components/ui/Dialog.tsx';
import { Field, Input } from '@/components/ui/Field.tsx';
import { ApiError } from '@/lib/apiClient.ts';
import { interpolate } from '@/lib/formatters.ts';
import admin from '@/content/admin.json';
import common from '@/content/common.json';
import { useCreateCustomer, useUpdateCustomer } from '../api/queries.ts';
import { autoColor, colorName, CUSTOMER_COLORS } from './customerColors.ts';

/**
 * Add / Edit Customer (screen 03's modal).
 *
 * The wireframe's "Auto" swatch is the default and is resolved from the name, so
 * an admin who does not care about colour still gets a distinct one rather than
 * every new customer sharing the first swatch.
 *
 * The generated `code` is shown as a hint but never edited — it is the prefix of
 * every Task ID already issued for the customer, and the handler ignores any
 * attempt to change it.
 */

interface FormState {
  name: string;
  description: string;
  /** Empty means "Auto": derive from the name at submit time. */
  color: string;
}

const EMPTY: FormState = { name: '', description: '', color: '' };

/** Mounted only while open and keyed on the subject — see `UserFormDialog`. */
export function CustomerFormDialog({
  customer,
  onClose,
}: {
  customer: Customer | null;
  onClose: () => void;
}) {
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();

  const [form, setForm] = useState<FormState>(() =>
    customer === null
      ? EMPTY
      : { name: customer.name, description: customer.description, color: customer.color },
  );
  const [errors, setErrors] = useState<Partial<Record<'name' | 'color', string>>>({});

  const isPending = createCustomer.isPending || updateCustomer.isPending;
  const resolvedColor = form.color === '' ? autoColor(form.name) : form.color;
  const previewName = form.name.trim() === '' ? admin.customers.preview : form.name;

  function submit() {
    const parsed = createCustomerInputSchema.safeParse({ ...form, color: resolvedColor });
    if (!parsed.success) {
      const next: Partial<Record<'name' | 'color', string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === 'name' || key === 'color') next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }

    const onError = (cause: unknown) => {
      toast.error(cause instanceof ApiError ? cause.message : common.errors.generic);
    };

    if (customer === null) {
      createCustomer.mutate(parsed.data, {
        onSuccess: (created) => {
          toast.success(interpolate(admin.customers.created, { name: created.name }));
          onClose();
        },
        onError,
      });
    } else {
      updateCustomer.mutate(
        { customerId: customer.id, input: parsed.data },
        {
          onSuccess: (updated) => {
            toast.success(interpolate(admin.customers.updated, { name: updated.name }));
            onClose();
          },
          onError,
        },
      );
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={customer === null ? admin.customers.addTitle : admin.customers.editTitle}
      description={customer === null ? admin.customers.addSubtitle : admin.customers.editSubtitle}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {common.actions.cancel}
          </Button>
          <Button variant="adminPrimary" onClick={submit} isLoading={isPending}>
            {customer === null
              ? isPending
                ? admin.customers.creating
                : admin.customers.create
              : isPending
                ? admin.customers.saving
                : admin.customers.save}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field
          label={admin.customers.nameLabel}
          required
          error={errors.name}
          hint={customer === null ? admin.customers.codeHint : undefined}
        >
          <Input
            value={form.name}
            onChange={(event) => {
              setForm({ ...form, name: event.target.value });
            }}
            placeholder={admin.customers.namePlaceholder}
          />
        </Field>

        <Field label={admin.customers.descriptionLabel}>
          <Textarea
            value={form.description}
            onChange={(event) => {
              setForm({ ...form, description: event.target.value });
            }}
            rows={3}
            placeholder={admin.customers.descriptionPlaceholder}
          />
        </Field>

        <fieldset>
          <legend className="text-sm font-medium text-ink-900">{admin.customers.colorLabel}</legend>
          <p className="mt-1 text-xs text-ink-500">{admin.customers.colorHint}</p>

          <div className="mt-3 flex flex-wrap gap-2">
            {CUSTOMER_COLORS.map((color) => {
              const isSelected = form.color.toLowerCase() === color.hex.toLowerCase();
              return (
                <button
                  key={color.hex}
                  type="button"
                  // The swatch carries the colour NAME, not the hex: a screen
                  // reader announcing "#7c3aed" tells the listener nothing.
                  aria-label={interpolate(admin.customers.colorSwatch, { name: color.name })}
                  aria-pressed={isSelected}
                  onClick={() => {
                    setForm({ ...form, color: color.hex });
                  }}
                  style={{ backgroundColor: color.hex }}
                  className={cn(
                    'grid size-9 place-items-center rounded-control transition-transform',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600',
                    isSelected ? 'ring-2 ring-ink-900 ring-offset-2' : 'hover:scale-105',
                  )}
                >
                  {isSelected ? <Check className="size-4 text-white" aria-hidden="true" /> : null}
                </button>
              );
            })}
          </div>

          <p className="mt-3 text-sm text-ink-500">
            {interpolate(admin.customers.colorSelected, {
              name: colorName(resolvedColor) ?? resolvedColor,
            })}
          </p>

          <div className="mt-2">
            <CustomerChip name={previewName} color={resolvedColor} variant="inline" />
          </div>
        </fieldset>
      </div>
    </Dialog>
  );
}
