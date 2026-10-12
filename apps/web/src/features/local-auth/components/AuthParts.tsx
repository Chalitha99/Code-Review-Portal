import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/components/ui';

/**
 * Pieces shared by the three screens: the brand-panel copy and the form card.
 * Styling matches the sign-in screen's panel so the four read as one family.
 */

export function PanelCopy({
  heading,
  text,
  tips,
  steps,
  note,
}: {
  heading: string;
  text?: string | undefined;
  tips?: readonly string[] | undefined;
  /** An ordered list — use when the sequence matters. */
  steps?: readonly string[] | undefined;
  note?: string | undefined;
}) {
  return (
    <>
      {/* `text-white` is required: the base layer colours h1–h4 explicitly. */}
      <h1 className="animate-reveal-up font-display text-4xl leading-[1.1] font-extrabold text-white xl:text-5xl">
        {heading}
      </h1>

      {text === undefined ? null : (
        <p className="mt-5 max-w-sm animate-reveal-up text-sm leading-relaxed text-white/80 [animation-delay:100ms]">
          {text}
        </p>
      )}

      {tips === undefined && steps === undefined ? null : (
        <span
          className="mt-9 block h-px w-16 animate-reveal-fade bg-white/40 [animation-delay:160ms]"
          aria-hidden="true"
        />
      )}

      {tips === undefined ? null : (
        <ul className="mt-6 space-y-3.5">
          {tips.map((tip, index) => (
            <li
              key={tip}
              className="flex animate-reveal-up items-start gap-3 text-sm text-white/90"
              style={{ animationDelay: `${String(200 + index * 70)}ms` }}
            >
              <span
                className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-white/20 ring-1 ring-white/25"
                aria-hidden="true"
              >
                <Check className="size-3" />
              </span>
              <span className="leading-6">{tip}</span>
            </li>
          ))}
        </ul>
      )}

      {steps === undefined ? null : (
        <ol className="mt-6 space-y-3.5">
          {steps.map((step, index) => (
            <li
              key={step}
              className="flex animate-reveal-up items-start gap-3 text-sm text-white/90"
              style={{ animationDelay: `${String(200 + index * 70)}ms` }}
            >
              <span
                className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-white/20 text-xs font-semibold ring-1 ring-white/25"
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <span className="leading-6">{step}</span>
            </li>
          ))}
        </ol>
      )}

      {note === undefined ? null : (
        <p className="mt-8 animate-reveal-fade text-xs leading-relaxed text-white/70 [animation-delay:400ms]">
          {note}
        </p>
      )}
    </>
  );
}

/** The white card the form, the confirmation and the success state sit in. */
export function AuthCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn('rounded-card border border-line bg-surface p-6 shadow-card sm:p-7', className)}
    >
      {children}
    </div>
  );
}

/** Card title and subtitle. The heading is focusable so a state change can move focus to it. */
export function CardHeading({
  title,
  subtitle,
  icon,
  headingRef,
}: {
  title: string;
  icon?: ReactNode;
  subtitle?: string | undefined;
  headingRef?: React.Ref<HTMLHeadingElement> | undefined;
}) {
  return (
    <header className="mb-6">
      {icon === undefined ? null : (
        <span
          className="mb-4 grid size-11 place-items-center rounded-full bg-violet-50 text-violet-700"
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="font-display text-2xl font-bold text-ink-900 focus:outline-none"
      >
        {title}
      </h2>
      {subtitle === undefined ? null : (
        <p className="mt-2 text-sm leading-relaxed text-ink-500">{subtitle}</p>
      )}
    </header>
  );
}
