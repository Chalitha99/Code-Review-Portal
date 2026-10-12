import { ShieldCheck, Sparkles, TrendingUp, Zap } from 'lucide-react';
import type { User } from '@sdp/contracts';
import { EmptyState } from '@/components/common/states.tsx';
import { WORKSPACE_ROOT } from '@/config/routes.ts';
import { accessibleWorkspaces } from '@/lib/permissions.ts';
import home from '@/content/home.json';
import { cn } from '@/components/ui';
import { PAGE_CONTAINER } from '@/components/common/PageContainer.tsx';
import { Reveal } from '@/components/common/Reveal.tsx';
import { WorkspaceCard } from '../components/WorkspaceCard.tsx';

const HIGHLIGHT_STYLE = {
  fast: { icon: Zap, className: 'bg-amber-50 text-amber-700' },
  quality: { icon: ShieldCheck, className: 'bg-emerald-50 text-emerald-700' },
  tracking: {
    icon: TrendingUp,
    className: 'bg-brand-blue-50 text-brand-blue-600',
  },
} as const;

/**
 * Neutral styling for a highlight added to `home.json` without a matching entry
 * above. Previously this path was an `as keyof typeof` cast, which produced
 * `undefined.icon` and a blank page at runtime instead of a slightly plain pill.
 */
const HIGHLIGHT_FALLBACK = {
  icon: Sparkles,
  className: 'bg-canvas text-ink-700',
} as const;

function highlightStyle(id: string): { icon: typeof Zap; className: string } {
  return Object.hasOwn(HIGHLIGHT_STYLE, id)
    ? HIGHLIGHT_STYLE[id as keyof typeof HIGHLIGHT_STYLE]
    : HIGHLIGHT_FALLBACK;
}

/**
 * Soft geometric shapes behind the hero, matching the wireframe.
 *
 * These were drawn but never animated — the drift keyframes existed and were
 * used only on the login panel. The hero is the landing surface, so it gets the
 * *quick* variants: the login panel sits behind a form and is deliberately
 * near-motionless, whereas at those durations a hero simply reads as static.
 *
 * Negative `animation-delay` starts each shape partway through its cycle, so
 * they never move in lockstep. `overflow-hidden` on the wrapper contains the
 * drift, which is what keeps the transforms from widening the page.
 */
function HeroDecoration() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Soft atmospheric blue & purple glow orbs providing depth and ambient light */}
      <span className="absolute -top-20 left-1/4 size-96 -translate-x-1/2 animate-breathe-slow rounded-full bg-brand-blue-500/10 blur-3xl" />
      <span className="absolute top-1/4 -right-16 size-80 animate-breathe-fast rounded-full bg-violet-500/10 blur-3xl [animation-delay:-4s]" />
      <span className="absolute -bottom-16 left-12 size-72 animate-breathe-slow rounded-full bg-brand-purple/10 blur-3xl [animation-delay:-8s]" />

      {/* Floating geometric shapes matching the SEBSA blue/purple visual theme */}
      {/* Left gutter floating shapes */}
      <span className="absolute top-16 left-[8%] size-28 animate-drift-slow-quick rounded-full border border-violet-200/40 bg-gradient-to-br from-violet-100/60 to-brand-blue-100/30 shadow-sm backdrop-blur-[1px]" />
      <span className="absolute top-44 left-[3%] size-16 animate-drift-medium-quick rounded-2xl border border-blue-200/40 bg-gradient-to-tr from-brand-blue-100/50 to-violet-100/40 [animation-delay:-5s]" />
      <span className="absolute top-56 left-[14%] size-20 animate-drift-fast-quick rounded-3xl border border-violet-200/30 bg-violet-100/45 [animation-delay:-3s]" />
      <span className="absolute top-72 left-[6%] size-2.5 animate-breathe-fast rounded-full bg-brand-blue-500/25 [animation-delay:-2s]" />

      {/* Right gutter floating shapes */}
      <span className="absolute top-20 right-[10%] size-24 rotate-45 animate-drift-medium-quick rounded-3xl border border-violet-200/40 bg-gradient-to-bl from-violet-100/60 to-brand-purple/10 shadow-sm [animation-delay:-8s]" />
      <span className="absolute top-52 right-[5%] size-20 animate-drift-slow-quick rounded-full border border-blue-200/40 bg-gradient-to-tl from-brand-blue-100/50 to-violet-100/40 [animation-delay:-11s]" />
      <span className="absolute top-64 right-[16%] size-16 animate-drift-fast-quick rounded-2xl border border-violet-200/30 bg-violet-100/45 [animation-delay:-6s]" />
      <span className="absolute top-36 right-[20%] size-3 animate-breathe-slow rounded-full bg-violet-500/25 [animation-delay:-6s]" />
    </div>
  );
}

/**
 * Portal home — the workspace chooser.
 *
 * Only the workspaces the user's roles permit are rendered (spec FL 2.1-02).
 * This is presentation, not security: the route guard blocks direct URL entry
 * and, in Phase 2, the API refuses the data regardless of what the UI drew.
 */
export function HomePage({ user }: { user: User }) {
  const workspaces = accessibleWorkspaces(user.roles);

  return (
    <div className="bg-surface">
      {/* ---------------------------------------------------------- hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-violet-50/40 to-white py-20">
        <HeroDecoration />

        <div className={cn(PAGE_CONTAINER, 'relative')}>
          <div className="mx-auto max-w-3xl text-center">
            {/*
              Poppins, like every other heading in the product.

              This was `font-ui` — the host platform's own face — for one release,
              on an earlier reading of the requirement. The wireframe draws the
              hero in Poppins, so it now matches the display face the rest of the
              app already uses and the `--font-ui` token has been removed with it:
              it had exactly one call site, which was this.

              `font-display` is what the base layer already puts on `h1`–`h4`, so
              the class is redundant today. It is written out anyway because this
              heading has been overridden once and the explicit class is what
              makes the intent visible at the call site.
            */}
            <h1 className="animate-reveal-up font-display text-5xl font-extrabold tracking-tight sm:text-6xl">
              <span className="text-navy-900">{home.hero.titleLead} </span>
              {/*
                `text-brand-gradient-deep` clips the brand ramp to the glyphs.
                The `-deep` variant, not the plain one: that starts at
                `brand-cyan`, which measures 1.81:1 on this surface — below even
                the 3:1 large-text minimum. This ramp starts at a real blue,
                which is also closer to the Power App reference. The
                utility already existed in the token file with zero call sites —
                this word is what it was written for.

                `inline-block` is required: `background-clip: text` needs a block
                formatting context, and on a plain inline span the gradient is
                computed across the whole line box instead of the word.

                The rule beneath is a separate element rather than
                `text-decoration`, because an underline cannot carry a gradient.
              */}
              <span className="relative inline-block">
                <span className="text-brand-gradient-deep">{home.hero.titleAccent}</span>
                <span
                  className="absolute inset-x-0 -bottom-1 h-1 rounded-full bg-brand-gradient-deep"
                  aria-hidden="true"
                />
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-xl animate-reveal-up text-base leading-relaxed text-ink-500 [animation-delay:80ms]">
              {home.hero.subtitle}
            </p>

            <ul className="mt-8 flex animate-reveal-up flex-wrap items-center justify-center gap-3 [animation-delay:160ms]">
              {home.hero.highlights.map((highlight) => {
                const style = highlightStyle(highlight.id);
                const Icon = style.icon;
                return (
                  <li
                    key={highlight.id}
                    className={`inline-flex items-center gap-1.5 rounded-badge px-4 py-2 text-sm font-medium ${style.className}`}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {highlight.label}
                  </li>
                );
              })}
            </ul>

            <div className="mx-auto mt-10 max-w-lg animate-reveal-up border-t border-line pt-6 [animation-delay:240ms]">
              <p className="text-sm text-ink-500">
                {home.hero.welcomeBack}{' '}
                <span className="font-semibold text-ink-900">{user.name}</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------- workspaces */}
      <section className="border-t border-line bg-canvas py-12">
        <div className={PAGE_CONTAINER}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-xl font-bold">{home.workspaces.title}</h2>
              <p className="mt-1 text-sm text-ink-500">{home.workspaces.subtitle}</p>
            </div>
          </div>

          {workspaces.length === 0 ? (
            <EmptyState className="mt-8" title={home.workspaces.empty} />
          ) : (
            <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {workspaces.map((workspace, index) => (
                // Staggered so the row assembles left to right rather than
                // appearing all at once. 90ms apart keeps the whole group under
                // ~300ms, which is the point past which a stagger reads as lag.
                //
                // `h-full` because THIS div is the grid item, not the card
                // inside it. The grid stretches the wrapper; without passing
                // that height on, the card sizes to its own text and the row
                // ends up ragged.
                <Reveal key={workspace} delay={index * 90} className="h-full">
                  <WorkspaceCard workspace={workspace} to={WORKSPACE_ROOT[workspace]} />
                </Reveal>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
