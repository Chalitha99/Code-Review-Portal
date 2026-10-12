import { useState } from 'react';
import { Alert } from '@/components/ui/Alert.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { Dialog } from '@/components/ui/Dialog.tsx';
import { Field, Input } from '@/components/ui/Field.tsx';
import common from '@/content/common.json';
import { Checkbox } from '@/components/ui/controls.tsx';
import type { TaskTypeRecord } from '@sdp/contracts';

/**
 * Name + order, which is the whole of a Category and the whole of a Task Type.
 *
 * One dialog for both rather than two near-identical ones. The fields, the
 * validation and the "blank order means append" rule are the same, and the only
 * difference is the copy the caller passes in.
 *
 * Mounted only while open and keyed on the subject, so it seeds from `useState`
 * rather than copying props into state from an effect.
 */
export function NamedRecordDialog({
  title,
  description,
  nameLabel,
  namePlaceholder,
  orderLabel,
  orderHint,
  submitLabel,
  initial,
  isPending,
  onSubmit,
  onClose,
  taskTypes,
  hideOrder = true,
}: {
  title: string;
  description: string;
  nameLabel: string;
  namePlaceholder: string;
  orderLabel: string;
  orderHint: string;
  submitLabel: string;
  /** `null` creates. */
  initial: {
    name: string;
    order: number;
    questionCount?: number;
    applicableTaskTypeIds?: string[];
  } | null;
  isPending: boolean;
  /** `order` is `undefined` when the field was left blank — the server appends. */
  onSubmit: (values: {
    name: string;
    order: number | undefined;
    applicableTaskTypeIds?: string[];
  }) => void;
  onClose: () => void;
  taskTypes?: readonly TaskTypeRecord[];
  hideOrder?: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [order, setOrder] = useState(initial === null ? '' : String(initial.order));
  const [error, setError] = useState<string | undefined>(undefined);
  const [applicableTaskTypeIds, setApplicableTaskTypeIds] = useState<string[]>(
    initial?.applicableTaskTypeIds ?? [],
  );

  const removedTaskTypeIds = (initial?.applicableTaskTypeIds ?? []).filter(
    (id) => !applicableTaskTypeIds.includes(id),
  );
  const removedNames = removedTaskTypeIds
    .map((id) => taskTypes?.find((type) => type.id === id)?.name ?? id)
    .join(', ');

  function submit() {
    if (name.trim() === '') {
      setError(nameLabel === '' ? 'Required' : `${nameLabel} is required`);
      return;
    }
    if (taskTypes !== undefined && applicableTaskTypeIds.length === 0) {
      setError('Select at least one task type');
      return;
    }

    const parsedOrder = hideOrder || order.trim() === '' ? undefined : Number(order);
    if (parsedOrder !== undefined && (!Number.isInteger(parsedOrder) || parsedOrder < 0)) {
      setError(orderHint);
      return;
    }

    onSubmit({
      name: name.trim(),
      order: parsedOrder,
      ...(taskTypes === undefined ? {} : { applicableTaskTypeIds }),
    });
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {common.actions.cancel}
          </Button>
          <Button variant="adminPrimary" onClick={submit} isLoading={isPending}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={nameLabel} required error={error}>
          <Input
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
            placeholder={namePlaceholder}
          />
        </Field>

        {taskTypes === undefined ? null : (
          <fieldset>
            <legend className="text-sm font-medium text-ink-900">Applies to Task Types</legend>
            <p className="mt-1 text-xs text-ink-500">
              Every active question in this category inherits these task types.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {taskTypes
                .filter((type) => type.isActive || applicableTaskTypeIds.includes(type.id))
                .map((type) => (
                  <Checkbox
                    key={type.id}
                    label={`${type.name}${type.isActive ? '' : ' (Inactive)'}`}
                    checked={applicableTaskTypeIds.includes(type.id)}
                    onCheckedChange={(checked) => {
                      setApplicableTaskTypeIds((current) =>
                        checked ? [...current, type.id] : current.filter((id) => id !== type.id),
                      );
                    }}
                  />
                ))}
            </div>
            {removedTaskTypeIds.length > 0 ? (
              <div className="mt-3">
                <Alert tone="warning">
                  Removing {removedNames} will remove this category and its{' '}
                  {initial?.questionCount ?? 0} questions from future {removedNames} checklists.
                  Previously submitted checklist versions will not change.
                </Alert>
              </div>
            ) : null}
          </fieldset>
        )}

        {hideOrder ? null : (
          <Field label={orderLabel} hint={orderHint}>
            <Input
              type="number"
              min={0}
              value={order}
              onChange={(event) => {
                setOrder(event.target.value);
              }}
            />
          </Field>
        )}
      </div>
    </Dialog>
  );
}
