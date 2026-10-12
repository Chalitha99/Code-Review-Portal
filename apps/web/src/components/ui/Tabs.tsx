import type { ReactNode } from 'react';
import * as RadixTabs from '@radix-ui/react-tabs';
import { NavLink } from 'react-router-dom';
import { cn } from './lib/cn.ts';
import { rememberTabScrollOffset, TAB_NAVIGATION_STATE } from '@/lib/tabNavigation.ts';

/**
 * Pill tabs from Components sheet "06 · Navigation & Chrome": inactive tabs are
 * a flat tint, the active tab is white with a border and a soft shadow.
 *
 * Two variants exist because the two uses are genuinely different:
 *
 * - `RouteTabs` — each tab IS a route (`/admin/users`, `/admin/customers`).
 *   Figma draws Admin as tabs, the previous app used separate pages; routing
 *   them keeps deep links and browser Back working while matching the drawing.
 * - `Tabs` — Radix tabs for panels *within* one screen, where a URL would be
 *   noise (the three sub-tabs inside a Reports panel, cycle history sections).
 */

const TAB_BASE = [
  'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold',
  // `whitespace-nowrap` keeps a two-word tab on one line: the strip wraps
  // between tabs, never inside one. `shrink-0` on the icon stops it squashing
  // into an ellipse when the row is tight.
  'whitespace-nowrap [&>span]:shrink-0',
  'cursor-pointer transition-all duration-200',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600',
].join(' ');

const TAB_INACTIVE = 'text-ink-500 hover:bg-canvas hover:text-ink-900';
const TAB_ACTIVE = 'border border-line bg-surface text-brand-blue-600 shadow-sm';

export interface RouteTab {
  to: string;
  label: string;
  icon?: ReactNode | undefined;
  /** Exact match only — needed for index routes like `/admin`. */
  end?: boolean | undefined;
}

export function RouteTabs({
  tabs,
  label,
  className,
}: {
  tabs: readonly RouteTab[];
  /** Accessible name for the tab strip, e.g. "Admin sections". */
  label: string;
  className?: string;
}) {
  return (
    // The wireframes draw the strip as a grouped pill bar — a bordered tray with
    // the active tab raised inside it — not as loose links on the page
    // background. `w-fit max-w-full` keeps the tray tight to its tabs while
    // still allowing the seven-tab admin strip to wrap within the page.
    <nav
      aria-label={label}
      className={cn(
        'flex w-fit max-w-full flex-wrap gap-1 rounded-2xl border border-line/80 bg-canvas/70 p-1.5 shadow-sm',
        className,
      )}
    >
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end ?? false}
          /*
            The three lines that keep the reader's place when they change tabs.

            A tab is a real route, so `<ScrollRestoration />` would send it to the
            top like any other navigation — right for entering a workspace, wrong
            here, where the user is comparing two panels of the same dashboard.

            `preventScrollReset` says so declaratively but does NOT achieve it on
            its own, and that is measured, not assumed: at 1280x700 on Developer,
            scrolled to y=260 and clicking Analytics, the opt-out alone still
            landed at y=0. The incoming panel is lazy and renders its own loading
            state, so the document is briefly shorter than the viewport and the
            browser clamps `scrollY` to zero before anything can object.

            So `onClick` captures the offset while it still exists — after the
            navigation it is already gone — and `app/useTabScrollPreservation`
            puts it back once the panel has height again. Same measurement with
            the hook: y=260.

            `state` is what tells the scroll layer this navigation came from a tab
            strip rather than from a workspace card or a drill-down link. All
            three pieces are load-bearing; see `lib/tabNavigation.ts`.
          */
          preventScrollReset
          state={TAB_NAVIGATION_STATE}
          onClick={rememberTabScrollOffset}
          className={({ isActive }) => cn(TAB_BASE, isActive ? TAB_ACTIVE : TAB_INACTIVE)}
        >
          {({ isActive }) => (
            <>
              {tab.icon ? (
                <span className="shrink-0" aria-hidden="true">
                  {tab.icon}
                </span>
              ) : null}
              {tab.label}
              {/* NavLink sets aria-current itself; this covers the visual-only cue. */}
              {isActive ? <span className="sr-only"> (current)</span> : null}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

export interface PanelTab {
  value: string;
  label: string;
  icon?: ReactNode | undefined;
  content: ReactNode;
}

export function Tabs({
  tabs,
  value,
  onValueChange,
  label,
  className,
}: {
  tabs: readonly PanelTab[];
  value: string;
  onValueChange: (value: string) => void;
  label: string;
  className?: string;
}) {
  return (
    <RadixTabs.Root value={value} onValueChange={onValueChange} className={className}>
      <RadixTabs.List aria-label={label} className="flex flex-wrap gap-1">
        {tabs.map((tab) => (
          <RadixTabs.Trigger
            key={tab.value}
            value={tab.value}
            className={cn(
              TAB_BASE,
              TAB_INACTIVE,
              'data-[state=active]:border data-[state=active]:border-line',
              'data-[state=active]:bg-surface data-[state=active]:text-ink-900 data-[state=active]:shadow-card',
            )}
          >
            {tab.icon ? (
              <span className="shrink-0" aria-hidden="true">
                {tab.icon}
              </span>
            ) : null}
            {tab.label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>

      {tabs.map((tab) => (
        <RadixTabs.Content
          key={tab.value}
          value={tab.value}
          className="mt-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
        >
          {tab.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
}
