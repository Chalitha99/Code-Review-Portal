import type { UIMatch } from 'react-router-dom';

/**
 * Extra data a route can attach to itself.
 *
 * React Router surfaces `handle` through `useMatches()`, which lets the shell
 * ask "what is the current page called?" without a lookup table that has to be
 * kept in step with the route tree by hand. The title lives next to the route
 * that owns it.
 */
export interface RouteHandle {
  /** Shown beside the brand mark in the app bar. */
  title?: string;
}

function hasHandle(match: UIMatch): match is UIMatch<unknown, RouteHandle> {
  return typeof match.handle === 'object' && match.handle !== null;
}

/**
 * The title of the deepest matched route that declares one, so a nested page
 * overrides its parent rather than the other way round.
 */
export function resolveRouteTitle(matches: UIMatch[]): string | undefined {
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const match = matches[index];
    if (match && hasHandle(match) && match.handle.title) return match.handle.title;
  }
  return undefined;
}
