import { useState } from 'react';
import { toast } from 'sonner';
import {
  createChecklistQuestionInputSchema,
  type ChecklistCategory,
  type ChecklistQuestion,
} from '@sdp/contracts';
import { Button } from '@/components/ui/Button.tsx';
import { Checkbox, Textarea } from '@/components/ui/controls.tsx';
import { Dialog } from '@/components/ui/Dialog.tsx';
import { Field } from '@/components/ui/Field.tsx';
import { Select } from '@/components/ui/Select.tsx';
import { ApiError } from '@/lib/apiClient.ts';
import common from '@/content/common.json';
import { useCreateQuestion, useUpdateQuestion } from '../api/checklistAdmin.ts';

/** Create and edit questions without duplicating category-owned applicability. */
export function QuestionFormDialog({
  question,
  categories,
  defaultCategoryId,
  onClose,
}: {
  question: ChecklistQuestion | null;
  categories: readonly ChecklistCategory[];
  /** A category-scoped create keeps the parent fixed. */
  defaultCategoryId?: string | undefined;
  onClose: () => void;
}) {
  const createQuestion = useCreateQuestion();
  const updateQuestion = useUpdateQuestion();
  const isCreate = question === null;
  const isScopedCreate = isCreate && defaultCategoryId !== undefined;
  const [text, setText] = useState(question?.text ?? '');
  const [categoryId, setCategoryId] = useState(question?.categoryId ?? defaultCategoryId ?? '');
  const [isActive, setIsActive] = useState(question?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const currentCategory = categories.find((category) => category.id === categoryId);
  const isPending = createQuestion.isPending || updateQuestion.isPending;

  function reportError(cause: unknown) {
    setError(cause instanceof ApiError ? cause.message : common.errors.generic);
  }

  function submit() {
    const parsed = createChecklistQuestionInputSchema.safeParse({ text, categoryId });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter a valid question.');
      return;
    }
    if (isCreate) {
      createQuestion.mutate(parsed.data, {
        onSuccess: () => {
          toast.success('Question added.');
          onClose();
        },
        onError: reportError,
      });
      return;
    }
    updateQuestion.mutate(
      { id: question.id, input: { ...parsed.data, isActive } },
      {
        onSuccess: () => {
          toast.success('Question updated.');
          onClose();
        },
        onError: reportError,
      },
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={
        isScopedCreate
          ? `Add Question to "${currentCategory?.name ?? 'Category'}"`
          : isCreate
            ? 'Add Question'
            : 'Edit Question'
      }
      description={
        isScopedCreate
          ? 'It will appear at the end of this category and inherit its task types.'
          : 'Questions belong to one category. Reorder them directly in the checklist structure.'
      }
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {common.actions.cancel}
          </Button>
          <Button variant="adminPrimary" onClick={submit} isLoading={isPending}>
            {isCreate ? 'Add Question' : common.actions.save}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error === null ? null : (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Field label="Question" required>
          <Textarea value={text} onChange={(event) => setText(event.target.value)} rows={3} />
        </Field>
        {isScopedCreate ? null : (
          <Field label="Category" required>
            <Select
              value={categoryId}
              onValueChange={setCategoryId}
              options={categories.map((category) => ({ value: category.id, label: category.name }))}
              placeholder="Select a category"
              aria-label="Category"
            />
          </Field>
        )}
        {isCreate ? null : (
          <Checkbox
            checked={isActive}
            onCheckedChange={setIsActive}
            label="Active"
            description="Inactive questions remain available to administrators but are hidden from future checklists."
          />
        )}
      </div>
    </Dialog>
  );
}
