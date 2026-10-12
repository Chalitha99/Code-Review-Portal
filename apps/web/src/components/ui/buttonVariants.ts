import { cva } from 'class-variance-authority';

/**
 * Button styling, kept separate from the component so `Button.tsx` exports only
 * a component (what Fast Refresh needs) and so non-button elements that must
 * *look* like buttons — a react-router `<Link>` styled as a call to action —
 * can reuse the exact same classes instead of approximating them.
 */
export const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 rounded-control font-semibold',
    /*
     * `whitespace-nowrap` and `[&>svg]:shrink-0` belong together.
     *
     * Every size below is a fixed height (`h-8`/`h-10`/`h-11`), so a label that
     * wraps does not grow the button — it overflows it. And because most call
     * sites pass their icon as a child rather than through `leadingIcon`, the
     * icon needs `shrink-0` applied from here; the alternative is remembering it
     * at ~12 call sites, which is the same as not having it.
     */
    'whitespace-nowrap [&>svg]:shrink-0',
    /*
     * ONE transition declaration, listing every property any variant animates.
     *
     * Two `transition-property` utilities of equal specificity are settled by
     * their order in the generated stylesheet, not by the order they appear in a
     * `class` attribute — so a variant that adds its own `transition-[…]` may or
     * may not beat this one, unpredictably. Declaring the superset here removes
     * the question. Nothing but `workspace` currently moves or filters, and a
     * transition on a property that never changes costs nothing.
     */
    'transition-[color,background-color,border-color,box-shadow,transform,filter,opacity]',
    'duration-150 ease-[cubic-bezier(0.2,0.8,0.2,1)]',
    /*
     * Tailwind v4's Preflight sets `cursor: default` on `<button>` — a change
     * from v3, and the reason every button in the product looked inert on hover.
     * It belongs here rather than on each button because `buttonVariants` is also
     * what a `<Link>` styled as a call to action consumes, so one edit covers
     * both.
     */
    'cursor-pointer',
    // Disabled styling lives here so no caller has to remember it.
    /*
     * `aria-disabled` gets the same dimming as `disabled`, but stays clickable
     * and focusable.
     *
     * That is the difference between "you cannot do this" and "you cannot do
     * this YET, and here is why". A form gate that only dims a button leaves the
     * user hunting for the reason — and a natively `disabled` button cannot be
     * focused, so keyboard and screen-reader users are told even less. Call
     * sites that gate on incomplete input use `aria-disabled` and handle the
     * click by revealing the errors; `disabled` stays for genuinely inert
     * buttons, such as one whose request is already in flight.
     */
    'disabled:pointer-events-none disabled:opacity-50',
    'aria-disabled:opacity-50',
    // Deliberately does not override the global focus-visible ring.
    'focus-visible:outline-2 focus-visible:outline-offset-2',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-violet-600 text-white hover:bg-violet-700',
        /** Moderate, accessible CTA used by Admin workflows without changing other workspaces. */
        adminPrimary: [
          'bg-brand-purple text-white shadow-xs',
          'hover:brightness-95 active:brightness-90',
          'focus-visible:outline-violet-600',
          'disabled:bg-line-strong disabled:text-ink-500 disabled:opacity-100',
          'aria-disabled:bg-line-strong aria-disabled:text-ink-500 aria-disabled:opacity-100',
        ].join(' '),
        /** Brand ramp. Reserved for the single most important action on a page. */
        brand: 'bg-brand-gradient text-white shadow-card hover:opacity-95',
        /**
         * A button that belongs to a workspace, and is filled with that
         * workspace's gradient.
         *
         * Supplies no background of its own: the caller passes
         * `WORKSPACE_THEME[role].gradient`, which is the single place role
         * colour is defined. A `developer` / `reviewer` / `admin` triple here
         * would be three variants that each duplicate a token, and the first one
         * edited in isolation is where the role colours start drifting again.
         *
         * The hover is deliberately small — these sit one per row in a grid, so
         * anything larger turns a pointer sweep down the table into a ripple.
         */
        workspace: [
          'text-white shadow-card',
          'hover:-translate-y-px hover:shadow-card-hover hover:brightness-110',
          'active:translate-y-0 active:brightness-95',
        ].join(' '),
        secondary: 'border border-line-strong bg-surface text-ink-900 hover:bg-canvas',
        /** Navy fill, from sheet 04. Used where violet would compete with a CTA. */
        dark: 'bg-ink-900 text-white hover:bg-navy-700',
        ghost: 'text-ink-700 hover:bg-canvas',
        danger: 'bg-danger text-white hover:bg-red-700',
        success: 'bg-success text-white hover:bg-green-700',
        link: 'text-brand-blue-600 underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4 text-sm',
        lg: 'h-11 px-5 text-sm',
        icon: 'size-10 p-0',
      },
      fullWidth: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
      fullWidth: false,
    },
  },
);
