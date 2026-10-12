import type { WorkspaceKey } from './routes.ts';

/**
 * The visual identity of each workspace, in one place.
 *
 * Developer, Reviewer and Admin each carry a colour that has to be the SAME
 * colour on the Home card, on the workspace page header, on that workspace's
 * grid heading icon and on its links. It was not: the Home cards mixed
 * `from-workspace-* to-brand-*` gradients while `PageHeader` filled a flat
 * `bg-workspace-*`, so the tile a user clicked on Home and the tile at the top
 * of the screen it opened were visibly different colours.
 *
 * One record fixes that by construction. A screen asks for its workspace's
 * classes; it never writes a gradient or an accent class of its own.
 *
 * The gradient utilities themselves live in `@sdp/config/tailwind.tokens.css`
 * (`bg-workspace-*-gradient`), because that is where the endpoints belong —
 * this file maps roles onto them and adds nothing else.
 *
 * `config/` rather than `components/`: both `components/PageHeader` and three
 * different features consume it, and `config/` is the only layer all of them are
 * permitted to import under the boundary rules.
 */
export interface WorkspaceTheme {
  /**
   * Icon tiles, accent rules, and the fill of a row action that belongs to this
   * workspace — the reviewer's Pick button.
   */
  gradient: string;
  /** Links, heading icons, section titles. The gradient's dark end; clears AA. */
  accentText: string;
}

export const WORKSPACE_THEME = {
  developer: {
    gradient: 'bg-workspace-developer-gradient',
    accentText: 'text-workspace-developer',
  },
  reviewer: {
    gradient: 'bg-workspace-reviewer-gradient',
    accentText: 'text-workspace-reviewer',
  },
  admin: {
    gradient: 'bg-workspace-admin-gradient',
    accentText: 'text-workspace-admin',
  },
} as const satisfies Record<WorkspaceKey, WorkspaceTheme>;
