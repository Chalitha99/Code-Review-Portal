import type { ReactNode } from 'react';
import { cn } from '@/components/ui';

/**
 * The scene behind an empty grid: a sheet with nothing written on it yet.
 *
 * One drawing, not one per screen. The sheet, its rules and its accent live here;
 * the CALLER supplies the glyph that sits on the badge — `ListChecks` on My
 * Tasks, `Inbox` on the review queue, `Building2` on Customers — so each empty
 * state still says something about the screen it is on without eight bespoke
 * illustrations to keep in step. A generic drawing repeated eight times is
 * decoration; this is the same sentence in eight dialects.
 *
 * Pure inline SVG in `currentColor` and design tokens — no asset to fetch, no
 * illustration library, and it follows the theme rather than baking in colours.
 * `Hourglass.tsx` set this pattern for the timeout screens; this is its sibling.
 *
 * DELIBERATELY STATIC. `Hourglass` earns its animation by describing something
 * that is actively happening; an empty table is a resting state, and a drawing
 * that pulses in the middle of it reads as though the page is still working. It
 * also keeps this off the list of surfaces the e2e suite has to settle before it
 * can measure anything.
 *
 * The whole thing is `aria-hidden`: `EmptyState` already hides its icon slot, and
 * the title and hint beside it carry the meaning.
 */
export function EmptyIllustration({
  children,
  className,
}: {
  /** The screen's own glyph. Sized here, so pass it without a size class. */
  children?: ReactNode | undefined;
  className?: string | undefined;
}) {
  return (
    <span className={cn('relative grid place-items-center', className)} aria-hidden="true">
      {/*
        A soft tinted pool behind the sheet, so the drawing has a footprint on a
        wide empty card instead of floating in the middle of it. `blur-2xl` keeps
        it as atmosphere rather than a second shape competing with the sheet.
      */}
      <span className="absolute size-36 rounded-full bg-violet-100/60 blur-2xl" />

      {/*
        `line-strong`, not an `ink-*` step: this is a drawn edge and it should sit
        in the same register as the table borders behind it. The ink scale starts
        at 400, which is text weight and too heavy for a line drawing.

        96 viewBox units drawn at 128px, so ONE UNIT IS 4/3 OF A PIXEL. That
        factor is the only thing the glyph below needs in order to sit on the
        badge, and it is written out at that call rather than left to be
        rediscovered.
      */}
      <svg
        viewBox="0 0 96 96"
        className="relative size-32 text-line-strong"
        fill="none"
        role="presentation"
      >
        {/*
          The sheet, with a folded corner.

          Filled `canvas` rather than `surface`: this sits on a white card, and a
          white page on a white card is only its outline. The app background is
          the one tint that reads as "paper" here without introducing a colour.
        */}
        <path
          d="M20 10h32l16 16v50a4 4 0 0 1-4 4H20a4 4 0 0 1-4-4V14a4 4 0 0 1 4-4Z"
          className="fill-canvas"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinejoin="round"
        />
        <path
          d="M52 10v12a4 4 0 0 0 4 4h12"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/*
          Three rules, ragged and tapering down the sheet.

          Even lengths at one opacity read as a filled-in form, which is the
          opposite of the message. The taper says "this is where the rows would
          be" without drawing rows nobody has created.
        */}
        <path
          d="M26 42h30M26 52h22M26 62h14"
          stroke="currentColor"
          strokeWidth={3.5}
          strokeLinecap="round"
          className="opacity-50"
        />

        {/*
          The badge: the one saturated thing in the drawing, and where the
          caller's glyph lands.

          Solid `violet-600` rather than a tint, and it is the same violet as the
          primary CTA — on My Tasks that is the "New Review Task" button sitting
          directly below this, so the drawing points at the way out of the empty
          state instead of merely decorating it. The pale sheet exists to let it
          carry that weight.

          The outer `surface` disc is a knockout ring: without it the badge sits
          straight on the sheet's rules and the glyph is read over a line.
        */}
        <circle cx="72" cy="70" r="20" className="fill-surface" />
        <circle cx="72" cy="70" r="16" className="fill-violet-600" />
      </svg>

      {/*
        The glyph, centred on the badge above.

        The badge is at (72, 70) in viewBox units; at 4/3 px per unit that is
        (96, 93.3) in the 128px box, and a 24px glyph therefore insets
        128 − 96 − 12 = 20px from the right and 128 − 93.3 − 12 ≈ 22px from the
        bottom. Sizing it HERE rather than at the call site is what keeps eight
        empty states agreeing on how big their icon is.
      */}
      {children ? (
        <span className="absolute right-5 bottom-5.5 text-white [&>svg]:size-6">{children}</span>
      ) : null}
    </span>
  );
}
