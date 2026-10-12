import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * `tailwind-merge` knows Tailwind's built-in scales but not ours. Without
 * registering the custom radius and shadow keys, `cn("rounded-card", "rounded-none")`
 * would keep both classes and the last-one-wins expectation would quietly break.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      rounded: [{ rounded: ['control', 'card', 'panel'] }],
      shadow: [{ shadow: ['card', 'raised', 'popover'] }],
    },
  },
});

/**
 * Compose class names with conditional logic, then resolve Tailwind conflicts so
 * a caller-supplied `className` always beats the component's own defaults.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
