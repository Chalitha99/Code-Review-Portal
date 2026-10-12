import { Link } from 'react-router-dom';
import type { PendingReviewTask } from '@sdp/contracts';
import { routePaths } from '@/constants/routePaths.ts';
import { interpolate } from '@/lib/formatters.ts';
import admin from '@/content/admin.json';

/** Inline, blocking explanation shown inside the dialog that attempted the change. */
export function PendingReviewTasksNotice({
  name,
  tasks,
}: {
  name: string;
  tasks: readonly PendingReviewTask[];
}) {
  const copy = admin.users.pendingTasks;

  return (
    <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
      <p className="font-semibold text-amber-900">
        {interpolate(copy.title, { name, count: String(tasks.length) })}
      </p>
      <p className="mt-1 text-amber-800">{copy.hint}</p>
      {tasks.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {tasks.map((task) => (
            <li key={`${task.kind}-${task.id}`} className="flex flex-wrap items-center gap-2">
              <Link
                to={routePaths.crp.admin.task(task.id)}
                className="font-medium text-brand-blue-700 underline-offset-2 hover:underline"
                aria-label={interpolate(copy.open, { taskCode: task.taskCode })}
              >
                {task.taskCode}
              </Link>
              <span className="text-ink-700">{task.title}</span>
              <span className="rounded border border-amber-300 px-1.5 text-xs text-amber-900">
                {copy.kinds[task.kind]}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
