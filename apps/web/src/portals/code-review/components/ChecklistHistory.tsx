import { useMemo, useState } from 'react';
import type { ChecklistSubmission, TaskChecklist } from '@sdp/contracts';
import { Select } from '@/components/ui/Select.tsx';
import { ChecklistSummary } from './ChecklistSummary.tsx';
import { formatDateTime } from '@/lib/formatters.ts';

function asChecklist(submission: ChecklistSubmission): TaskChecklist {
  return {
    id: submission.id,
    taskId: submission.taskId,
    taskTypeIds: submission.taskTypes.map((type) => type.id),
    answers: submission.categories.flatMap((category) =>
      category.questions.map((question, index) => ({
        questionId: question.questionId,
        questionText: question.questionText,
        categoryName: category.categoryName,
        order: category.categoryOrder * 10_000 + question.questionOrder + index,
        answer: question.answer,
      })),
    ),
    remarks: submission.remarks,
    isComplete: true,
    checkedDate: submission.submittedAt,
    developerId: submission.developerId,
  };
}

export function ChecklistHistory({
  submissions,
  fallback,
}: {
  submissions: readonly ChecklistSubmission[];
  fallback: TaskChecklist | null;
}) {
  const [selectedVersion, setSelectedVersion] = useState(String(submissions[0]?.version ?? ''));
  const selected =
    submissions.find((entry) => String(entry.version) === selectedVersion) ?? submissions[0];
  const checklist = useMemo(
    () => (selected === undefined ? fallback : asChecklist(selected)),
    [selected, fallback],
  );

  return (
    <div className="space-y-4">
      {submissions.length === 0 ? null : (
        <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-line bg-canvas/40 p-3">
          <div>
            <p className="text-sm font-bold text-ink-900">Checklist History</p>
            <p className="text-xs text-ink-500">
              Submitted versions are read-only and preserve their original wording.
            </p>
          </div>
          <div className="min-w-56">
            <Select
              value={String(selected?.version ?? '')}
              onValueChange={setSelectedVersion}
              aria-label="Checklist version"
              options={submissions.map((entry, index) => ({
                value: String(entry.version),
                label: `Version ${String(entry.version)} · ${formatDateTime(entry.submittedAt)}${index === 0 ? ' · Current review submission' : ''}`,
              }))}
            />
          </div>
        </div>
      )}
      <ChecklistSummary checklist={checklist} />
    </div>
  );
}
