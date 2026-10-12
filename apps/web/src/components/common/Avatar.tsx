import { cn } from '@/components/ui';
import { toInitials } from '@/lib/formatters.ts';

const SIZES = {
  sm: 'size-7 text-[0.65rem]',
  md: 'size-9 text-xs',
  lg: 'size-11 text-sm',
} as const;

/**
 * Initials avatar.
 *
 * `aria-hidden` because the person's name is always rendered next to it in
 * every current usage — announcing "CW" before "Charith Widanapathirana" is
 * noise. Pass `label` when the avatar stands alone.
 */
export function Avatar({
  name,
  size = 'md',
  label,
  className,
}: {
  name: string;
  size?: keyof typeof SIZES;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        // Official brand ramp, not an approximation of it.
        'inline-flex shrink-0 items-center justify-center rounded-full bg-brand-gradient font-semibold text-white',
        SIZES[size],
        className,
      )}
      {...(label === undefined ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label })}
    >
      {toInitials(name)}
    </span>
  );
}
