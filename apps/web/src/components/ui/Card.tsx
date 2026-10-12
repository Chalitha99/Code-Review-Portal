import {
  createContext,
  useContext,
  useId,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from './lib/cn.ts';

interface CollapsibleCardContextValue {
  expanded: boolean;
  contentId: string;
  summary?: ReactNode;
  toggle: () => void;
}

const CollapsibleCardContext = createContext<CollapsibleCardContextValue | null>(null);

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  collapsible?: boolean;
  defaultExpanded?: boolean;
  resetKey?: string | number;
  summary?: ReactNode;
}

/**
 * The panel surface used across every screen in the wireframes: white, hairline
 * border, generous radius, very soft elevation.
 */
export function Card({
  className,
  children,
  collapsible = false,
  defaultExpanded = true,
  resetKey = 'default',
  summary,
  ...props
}: CardProps) {
  const [expansion, setExpansion] = useState({ key: resetKey, expanded: defaultExpanded });
  const contentId = useId();
  const expanded = expansion.key === resetKey ? expansion.expanded : defaultExpanded;

  const card = (
    <div
      className={cn('rounded-card border border-line bg-surface shadow-card', className)}
      {...props}
    >
      {children}
    </div>
  );

  if (!collapsible) return card;

  return (
    <CollapsibleCardContext.Provider
      value={{
        expanded,
        contentId,
        summary,
        toggle: () => setExpansion({ key: resetKey, expanded: !expanded }),
      }}
    >
      {card}
    </CollapsibleCardContext.Provider>
  );
}

export function CardHeader({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const collapsible = useContext(CollapsibleCardContext);
  const heading = (
    <>
      {icon ? (
        <span className="mt-0.5 shrink-0 text-ink-400" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-base font-bold text-ink-900">{title}</h2>
        {description ? <p className="mt-1 text-sm text-ink-500">{description}</p> : null}
      </div>
    </>
  );

  if (collapsible) {
    return (
      <div className={cn('flex items-start gap-3 p-4 sm:p-5', className)}>
        <button
          type="button"
          onClick={collapsible.toggle}
          aria-expanded={collapsible.expanded}
          aria-controls={collapsible.contentId}
          className="-m-1 flex min-w-0 flex-1 items-start gap-3 rounded-lg p-1 text-left transition-colors hover:bg-canvas/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
        >
          {heading}
          {collapsible.summary ? (
            <span className="max-w-40 shrink-0 self-center truncate text-xs font-semibold text-ink-500">
              {collapsible.summary}
            </span>
          ) : null}
          <ChevronDown
            className={cn(
              'size-4 shrink-0 self-center text-ink-400 transition-transform duration-200',
              collapsible.expanded && 'rotate-180',
            )}
            aria-hidden="true"
          />
        </button>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    );
  }

  return (
    <div className={cn('flex items-start gap-3 p-6 pb-0', className)}>
      {icon ? (
        <span className="mt-0.5 shrink-0 text-ink-400" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        {/*
          `font-display` — Poppins, like every other heading. It was omitted
          here, which was invisible while neither brand face was actually being
          loaded and both fell back to the same system font; now that they load,
          a card title in Inter reads as a different typeface from the page
          title above it.
        */}
        <h2 className="font-display text-base font-bold text-ink-900">{title}</h2>
        {description ? <p className="mt-1 text-sm text-ink-500">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  const collapsible = useContext(CollapsibleCardContext);
  if (collapsible) {
    return (
      <div
        id={collapsible.contentId}
        aria-hidden={!collapsible.expanded}
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-200 ease-out',
          collapsible.expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="min-h-0 overflow-hidden" inert={!collapsible.expanded}>
          <div className={cn('p-6 pt-0', className)} {...props}>
            {children}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('p-6', className)} {...props}>
      {children}
    </div>
  );
}

/**
 * Sticky bottom action bar. Every wireframe with a form ends in one of these
 * (New Review Task, Quality Checklist, Review Task), so it is a component
 * rather than a repeated flex row.
 *
 * It is now actually sticky. The doc above has always said so, but the element
 * carried no `position`, so on the long forms — where it matters — the actions
 * sat off the bottom of a full page of scroll. `bg-surface` is opaque so the
 * content passes behind it, and `rounded-b-card` keeps the card's corners while
 * it floats over its own body.
 */
export function CardFooter({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  const collapsible = useContext(CollapsibleCardContext);
  if (collapsible && !collapsible.expanded) return null;

  return (
    <div
      className={cn(
        'sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-3 rounded-b-card border-t border-line bg-surface px-4 py-4 sm:px-6',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function Divider({
  label,
  className,
}: {
  /** When present, renders as a labelled rule ("or continue with"). */
  label?: string;
  className?: string;
}) {
  if (label === undefined) {
    return <hr className={cn('border-line', className)} />;
  }

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span className="h-px flex-1 bg-line" aria-hidden="true" />
      <span className="text-xs font-medium text-ink-400">{label}</span>
      <span className="h-px flex-1 bg-line" aria-hidden="true" />
    </div>
  );
}
