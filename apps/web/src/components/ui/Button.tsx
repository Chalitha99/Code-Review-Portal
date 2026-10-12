import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from './lib/cn.ts';
import { buttonVariants } from './buttonVariants.ts';

/**
 * The single button implementation.
 *
 * Every action surface routes through this — the review form's Approve /
 * Request Changes, wizard step navigation, dialog confirms. Before it existed,
 * buttons were ad-hoc class strings in `states.tsx` and `NotificationBell.tsx`,
 * which is precisely how a design system drifts.
 */
export interface ButtonProps
  extends
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'color'>,
    VariantProps<typeof buttonVariants> {
  /** Shows a spinner and blocks interaction. The button does not change width. */
  isLoading?: boolean | undefined;
  /** Replaces the visible label while loading. */
  loadingLabel?: string | undefined;
  leadingIcon?: ReactNode | undefined;
  trailingIcon?: ReactNode | undefined;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant,
    size,
    fullWidth,
    isLoading = false,
    loadingLabel,
    leadingIcon,
    trailingIcon,
    disabled,
    children,
    type = 'button',
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      // Defaults to "button": the classic bug is a button inside a form
      // submitting it because the type was left implicit.
      type={type}
      className={cn(buttonVariants({ variant, size, fullWidth }), className)}
      disabled={disabled === true || isLoading}
      aria-busy={isLoading}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
      ) : (
        leadingIcon
      )}
      {/*
        `children` are rendered DIRECTLY as flex children, not wrapped in a span.
        That wrapper was a real defect: almost every call site passes its icon as
        a child rather than through `leadingIcon`, so icon and label both landed
        inside one span — where the button's `gap-2` and `items-center` could not
        reach them, the icon had no `shrink-0`, and the two wrapped onto separate
        lines inside a fixed-height button. Visible on every action bar in the
        product.

        The loading label still needs its own element so it can replace the
        children wholesale.
      */}
      {isLoading && loadingLabel !== undefined ? <span>{loadingLabel}</span> : children}
      {isLoading ? null : trailingIcon}
    </button>
  );
});
