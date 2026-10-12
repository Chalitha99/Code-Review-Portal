import { cn } from '@/components/ui';

/**
 * An hourglass whose sand falls on a loop.
 *
 * Pure CSS on an inline SVG — no Lottie, no animation library, nothing to load.
 * `aria-hidden` because the text beside it says everything; an animated
 * decoration that also announced itself would be noise for a screen reader.
 *
 * Only `transform` and `opacity` animate, so it stays on the compositor, and the
 * global `prefers-reduced-motion` block in `global.css` stops it dead for anyone
 * who asks — which is exactly why this is a CSS `animation` and not a JS tween.
 *
 * Shared by the two places a timeout is reported: the notice above the login form
 * and the full-screen explanation. One SVG rather than two that drift apart.
 */
export function Hourglass({
  size = 'sm',
  className,
}: {
  /** `sm` for the inline notice, `lg` for the full-screen explanation. */
  size?: 'sm' | 'lg' | undefined;
  className?: string | undefined;
}) {
  const large = size === 'lg';

  return (
    <span
      className={cn(
        'relative grid shrink-0 place-items-center rounded-full bg-warning/15',
        large ? 'size-28' : 'size-11',
        className,
      )}
      aria-hidden="true"
    >
      {/*
        Two haloes, on the large variant only, breathing out of phase.

        They give the illustration presence on an otherwise empty screen without
        adding a second thing that moves in the corner of the eye — `breathe`
        animates opacity alone, so nothing travels.
      */}
      {large ? (
        <>
          <span className="absolute inset-0 animate-breathe rounded-full bg-warning/10" />
          <span className="absolute -inset-6 animate-breathe rounded-full bg-warning/5 [animation-delay:-4s]" />
        </>
      ) : null}

      <svg
        viewBox="0 0 24 24"
        className={cn('relative text-warning', large ? 'size-14' : 'size-6')}
        fill="none"
        strokeWidth={1.75}
      >
        <path
          d="M6 2h12M6 22h12M7 2v4.2a5 5 0 0 0 2.2 4.1L12 12l-2.8 1.7A5 5 0 0 0 7 17.8V22M17 2v4.2a5 5 0 0 1-2.2 4.1L12 12l2.8 1.7a5 5 0 0 1 2.2 4.1V22"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* The falling grain. Repeats on a 2s cycle. */}
        <circle cx="12" cy="12" r="0.9" fill="currentColor" className="animate-sand-fall" />
      </svg>
    </span>
  );
}
