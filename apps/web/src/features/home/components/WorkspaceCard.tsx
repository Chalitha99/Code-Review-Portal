import { ArrowRight, Code2, ClipboardCheck, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/components/ui';
import type { WorkspaceKey } from '@/config/routes.ts';
import { WORKSPACE_THEME } from '@/config/workspaceTheme.ts';
import common from '@/content/common.json';
import home from '@/content/home.json';

/**
 * The icon for each workspace. Colour is NOT here — it comes from
 * `WORKSPACE_THEME`, which is the same source the workspace page headers read,
 * so the tile a user clicks and the tile at the top of the screen it opens
 * cannot disagree.
 */
const WORKSPACE_ICON = {
  developer: Code2,
  reviewer: ClipboardCheck,
  admin: Shield,
} as const satisfies Record<WorkspaceKey, unknown>;

export function WorkspaceCard({ workspace, to }: { workspace: WorkspaceKey; to: string }) {
  const theme = WORKSPACE_THEME[workspace];
  const copy = home.workspaces.cards[workspace];
  const Icon = WORKSPACE_ICON[workspace];

  return (
    <Link
      to={to}
      className={cn(
        /*
         * `h-full` is what makes the three cards match.
         *
         * Each card is wrapped in a `<Reveal>` for the entry animation, so the
         * REVEAL div is the grid item and gets stretched to the row height —
         * not this link, which sized itself to its own content. At `lg` all
         * three sit in one row, so the shortest description left a visibly
         * shorter card; at narrower widths they wrap onto separate rows and the
         * mismatch never showed.
         */
        'group relative flex h-full flex-col overflow-hidden rounded-card bg-surface shadow-card-raised',
        'border border-transparent transition-all duration-300 ease-out',
        'hover:-translate-y-1.5 hover:border-line hover:shadow-card-raised-hover',
        'active:translate-y-0 active:duration-75',
        'cursor-pointer text-left',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600',
      )}
    >
      <span
        className={cn(
          'absolute inset-x-0 top-0 h-1 transition-all duration-300 ease-out group-hover:h-1.5',
          theme.gradient,
        )}
        aria-hidden="true"
      />

      <div className="relative flex flex-1 flex-col p-6 pt-7">
        <span
          className={cn(
            'grid size-11 place-items-center rounded-xl transition-all duration-300 ease-out',
            'group-hover:-translate-y-0.5 group-hover:scale-105 group-hover:shadow-md',
            theme.gradient,
          )}
          aria-hidden="true"
        >
          <Icon className="size-5 text-white" />
        </span>

        <h3 className="mt-5 font-display text-base font-bold text-ink-900 transition-colors duration-200">
          {copy.title}
        </h3>
        <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-500">{copy.description}</p>

        <span className="mt-5 border-t border-line pt-4">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 text-sm font-semibold transition-colors duration-200',
              theme.accentText,
            )}
          >
            {common.actions.openDashboard}
            <ArrowRight
              className="size-4 transition-transform duration-300 ease-out group-hover:translate-x-1.5"
              aria-hidden="true"
            />
          </span>
        </span>
      </div>
    </Link>
  );
}
