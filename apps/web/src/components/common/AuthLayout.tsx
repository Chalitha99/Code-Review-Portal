import type { ReactNode } from 'react';
import { SebsaLogo, cn } from '@/components/ui';
import common from '@/content/common.json';

/**
 * Ambient shapes behind the brand panel.
 *
 * FOUR elements, down from nine.
 *
 * The previous set — three outlined rings, two rounded squares, three filled
 * dots and two glows — read as a pattern rather than as atmosphere, and several
 * of them tracked straight across the copy column, which is the one thing
 * decoration behind text must not do. Nine shapes is also nine animations
 * compositing forever behind a form the user is trying to fill in.
 *
 * What is left is a two-glow depth field plus two outlined shapes, and every one
 * of them is positioned in the panel's outer gutters: the copy sits in a
 * `max-w-md` column against the left edge, so the right third and the extreme
 * corners are free. Nothing overlaps a word.
 *
 * Purely decorative and `aria-hidden`. `prefers-reduced-motion` stops all of it
 * via the global block in `styles/global.css` — which is what makes ambient
 * motion behind a login form acceptable at all.
 *
 * `e2e/login.spec.ts` asserts, in both directions, that these animate and that
 * every duration is over ten seconds. That is a deliberate negative control
 * against a quicker flourish creeping onto a form; keep any replacement inside
 * it.
 */
function PanelDecoration() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {/*
        Two large soft glows carry the depth. Opacity only — a blurred shape that
        moves smears, and at this size it would be the most distracting thing on
        the screen.
      */}
      <span className="absolute -top-40 -left-32 size-[32rem] animate-breathe rounded-full bg-white/15 blur-3xl" />
      <span className="absolute -right-40 -bottom-40 size-[34rem] animate-breathe rounded-full bg-brand-cyan/20 blur-3xl [animation-delay:-6s]" />

      {/*
        Two outlined shapes drift, in the right-hand gutter beside the copy
        column. Negative delays start them at different points in their cycles,
        so they never move in step with each other.
      */}
      <span className="absolute top-[14%] -right-16 size-64 animate-drift-slow rounded-full border border-white/20" />
      <span className="absolute right-[12%] bottom-[16%] size-40 animate-drift-medium rounded-[2.5rem] border border-white/15 [animation-delay:-9s]" />
    </div>
  );
}

/**
 * Where the two-panel layout collapses.
 *
 * - `lg` (1024px) is what the sign-in screen has always used.
 * - `900` is what the password screens use. Tailwind needs complete class
 *   strings, so both are spelled out rather than built from the key.
 */
const SPLIT = {
  lg: {
    grid: 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]',
    panel: 'lg:flex xl:p-14',
    mobileOnly: 'lg:hidden',
  },
  '900': {
    grid: 'min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]',
    panel: 'min-[900px]:flex xl:p-14',
    mobileOnly: 'min-[900px]:hidden',
  },
} as const;

export interface AuthLayoutProps {
  /** Brand copy for the gradient panel. The logo, decoration and footer are the layout's. */
  leftPanel: ReactNode;
  /**
   * Content of the compact header shown above the card when the panel is hidden.
   * Omit it to get the logo alone, which is what the sign-in screen shows.
   */
  compactHeader?: { heading: string; text?: string | undefined } | undefined;
  /** Where the two panels stack. Defaults to the sign-in screen's breakpoint. */
  split?: keyof typeof SPLIT | undefined;
  /** Wider card column, for screens with a checklist. */
  wide?: boolean | undefined;
  children: ReactNode;
}

/**
 * The two-panel shell shared by sign-in and the password screens: brand panel on
 * the left, form card on the right.
 *
 * Extracted from `LoginPage` unchanged so a new screen cannot drift from it.
 */
export function AuthLayout({
  leftPanel,
  compactHeader,
  split = 'lg',
  wide = false,
  children,
}: AuthLayoutProps) {
  const layout = SPLIT[split];

  return (
    // `h-dvh` + `overflow-hidden`: a login screen should never scroll. `dvh`
    // rather than `vh` so mobile browser chrome does not create hidden overflow.
    <div className={cn('grid h-dvh overflow-hidden', layout.grid)}>
      <section
        className={cn(
          'relative isolate hidden flex-col justify-between overflow-hidden bg-brand-gradient-deep p-10 text-white',
          layout.panel,
        )}
      >
        <PanelDecoration />

        <div className="relative">
          <SebsaLogo height={40} tone="inverse" title="" />
        </div>

        {/* `max-w-md` is load-bearing: it keeps the decoration's gutters clear. */}
        <div className="relative max-w-md">{leftPanel}</div>

        <p className="relative animate-reveal-fade text-xs text-white/60 [animation-delay:460ms]">
          {common.app.poweredBy}{' '}
          <span className="font-semibold text-white/80">{common.app.organisation}</span>
        </p>
      </section>

      {/* Scrolls INTERNALLY on a short viewport rather than clipping the submit
          button — a scrollbar on a 500px-tall window beats an unreachable CTA. */}
      <section className="flex flex-col overflow-y-auto bg-canvas px-5 py-8 sm:px-8">
        <div className={cn('m-auto w-full animate-reveal-up', wide ? 'max-w-md' : 'max-w-sm')}>
          {compactHeader === undefined ? (
            // The gradient panel is hidden below the split, so the brand appears here.
            <div className={cn('mb-8 flex justify-center', layout.mobileOnly)}>
              <SebsaLogo height={34} />
            </div>
          ) : (
            <div
              className={cn(
                'mb-6 rounded-card bg-brand-gradient-deep p-5 text-white',
                layout.mobileOnly,
              )}
            >
              <SebsaLogo height={26} tone="inverse" title="" />
              <p className="mt-4 font-display text-lg leading-snug font-bold text-white">
                {compactHeader.heading}
              </p>
              {compactHeader.text === undefined ? null : (
                <p className="mt-1 text-sm leading-relaxed text-white/80">{compactHeader.text}</p>
              )}
            </div>
          )}

          {children}
        </div>
      </section>
    </div>
  );
}
