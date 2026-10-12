import type { ReactNode } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from './lib/cn.ts';
import common from '@/content/common.json';

/**
 * Modal shell for the Add User, Add Customer, Assign Reviewer and Handover
 * modals.
 *
 * Radix rather than a hand-rolled overlay: focus trapping, focus restoration on
 * close, `aria-modal`, Escape handling and scroll locking are all easy to get
 * 90% right and the missing 10% is exactly what breaks keyboard users.
 *
 * THREE REGIONS, SEPARATED BY SPACE RATHER THAN RULES.
 *
 * `description` renders in the BODY, not beside the title. It used to sit in
 * the header under the `<Title>` in muted `text-sm` chrome, squeezed into the
 * column next to the close button — which read as a subtitle rather than as the
 * thing being asked. Every `ConfirmDialog` passes its whole confirmation
 * message through this prop, so "{name} will be permanently removed…" was
 * header furniture on all thirteen destructive dialogs while the body below it
 * rendered an empty padded band.
 *
 * `<RadixDialog.Description>` moved wholesale rather than being replaced with a
 * `<p>`: Radix wires `aria-describedby` through context, not DOM position, so
 * the accessible description follows it into the body for free.
 *
 * The `border-b`/`border-t` hairlines that used to fence the regions off are
 * gone with it. Padding, type scale and the button row carry the hierarchy;
 * the dialog is one card, not three stacked ones.
 */

const SIZES = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
} as const;

export function Dialog({
  open,
  onOpenChange,
  title,
  subtitle,
  icon,
  description,
  children,
  footer,
  size = 'md',
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: ReactNode | undefined;
  icon?: ReactNode | undefined;
  description?: string | undefined;
  children: ReactNode;
  /** Action row, pinned below the scrolling body. */
  footer?: ReactNode | undefined;
  size?: keyof typeof SIZES | undefined;
  className?: string | undefined;
}) {
  /*
   * The body is conditional for the same reason the footer always was.
   *
   * `ConfirmDialog` passes `{children ?? null}`, and most of its thirteen call
   * sites have no extra content — so an unconditional body rendered a blank
   * padded band under the title on every "Are you sure?" in the product.
   */
  const hasBody =
    description !== undefined ||
    (children !== null && children !== undefined && children !== false);

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-ink-900/40 backdrop-blur-[2px]" />
        <RadixDialog.Content
          className={cn(
            'fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2',
            // `max-h` + a scrolling body rather than a scrolling page: a modal
            // whose submit button falls off a short viewport is unusable.
            'flex max-h-[calc(100dvh-4rem)] flex-col rounded-card border border-line bg-surface shadow-popover',
            SIZES[size],
            className,
          )}
        >
          {/* Header: what this dialog is, and the way out. Nothing else. */}
          <div className="flex items-start gap-3.5 px-6 pt-5 pb-3">
            {icon ? <div className="shrink-0">{icon}</div> : null}
            {icon || subtitle ? (
              <div className="min-w-0 flex-1">
                <RadixDialog.Title className="font-display text-lg leading-tight font-bold text-ink-900">
                  {title}
                </RadixDialog.Title>
                {subtitle ? (
                  <p className="mt-1 text-xs leading-normal text-ink-500">{subtitle}</p>
                ) : null}
              </div>
            ) : (
              <RadixDialog.Title className="min-w-0 flex-1 font-display text-lg font-bold text-ink-900">
                {title}
              </RadixDialog.Title>
            )}
            <RadixDialog.Close
              aria-label={common.actions.close}
              className="-mt-1 grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg text-ink-400 transition-colors hover:bg-canvas hover:text-ink-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
            >
              <X className="size-4" aria-hidden="true" />
            </RadixDialog.Close>
          </div>

          {hasBody ? (
            // `pb-4` rather than nothing: this is the scroll container, so the
            // padding is what stops a long form's last field ending flush
            // against the clip edge.
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-4">
              {description ? (
                <RadixDialog.Description className="text-sm text-ink-700">
                  {description}
                </RadixDialog.Description>
              ) : null}
              {children}
            </div>
          ) : null}

          {footer ? (
            <div className="flex flex-wrap items-center justify-end gap-3 px-6 pt-2 pb-5">
              {footer}
            </div>
          ) : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
