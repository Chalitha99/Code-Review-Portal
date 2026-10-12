import type { ReactNode } from 'react';
import * as RadixTooltip from '@radix-ui/react-tooltip';
import { Info } from 'lucide-react';
import { cn } from './lib/cn.ts';

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  className?: string;
  delayDuration?: number;
}

export function Tooltip({
  content,
  children,
  side = 'top',
  align = 'center',
  className,
  delayDuration = 200,
}: TooltipProps) {
  return (
    <RadixTooltip.Provider delayDuration={delayDuration}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content
            side={side}
            align={align}
            sideOffset={4}
            className={cn(
              'border-ink-800 animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1 z-50 max-w-xs rounded-md border bg-ink-900 px-2.5 py-1.5 text-xs leading-snug font-normal text-white shadow-md',
              className,
            )}
          >
            {content}
            <RadixTooltip.Arrow className="fill-ink-900" />
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}

export interface InfoTooltipProps {
  content: string;
  className?: string;
  iconClassName?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
}

/**
 * Small accessible help icon that displays explanatory guidance on hover or focus.
 */
export function InfoTooltip({ content, className, iconClassName, side = 'top' }: InfoTooltipProps) {
  return (
    <Tooltip content={content} side={side}>
      <button
        type="button"
        title={content}
        aria-label={content}
        className={cn(
          'hover:text-ink-600 inline-flex cursor-help items-center justify-center rounded text-ink-400 transition-colors focus-visible:ring-1 focus-visible:ring-violet-500 focus-visible:outline-none',
          className,
        )}
      >
        <Info className={cn('size-3.5', iconClassName)} aria-hidden="true" />
      </button>
    </Tooltip>
  );
}
