# 0001 · Tailwind v4 with design tokens, not SCSS modules

**Status:** Accepted · **Date:** Phase 1, Sprint 0 (token layer revised in Sprint 1.5)

## Context

The Power Apps original had no reusable stylesheet. The previous Next.js attempt used SCSS —
`themes.scss`, `_mixins.scss`, `style.scss`, `_page.scss` — and that codebase was available to
adopt wholesale.

The wireframes are, visually, a Tailwind-shaped design already: a fixed spacing scale, one radius
family, a small semantic colour set, and components that repeat with small variations.

## Decision

Tailwind v4, with every colour, radius, shadow and font declared as a `@theme` token in
`packages/config/tailwind.tokens.css`. Components consume **semantic** tokens
(`bg-status-approved-surface`), never raw hex and never a brand token directly.

The SCSS files map across as: `themes.scss` → the token file, `_mixins.scss` → `@utility` plus
`components/ui/`, `style.scss` → `global.css`. `_page.scss` was deliberately **not** adopted —
screen styles stay colocated with their component, so deleting a screen deletes its CSS.

## Alternatives considered

- **Adopt the SCSS.** Rejected: a second styling system alongside the component library, and
  `_page.scss` is a shared file every screen edits, which is how orphan rules accumulate.
- **CSS Modules.** Would have worked. Rejected because the wireframes' repetition is exactly what
  utility classes handle well, and a module per component is a file per component to keep in sync.
- **MUI or another component library.** Rejected: a second design system to fight, and the
  wireframes are specific enough that we would have been overriding it everywhere.

## Consequences

**Good.** One place to change a colour. `prettier-plugin-tailwindcss` sorts classes so diffs are
stable. Unused utilities are never emitted.

**The cost.** Class strings are long, and a component with many states needs `cn()` discipline.
More importantly, tokens are only as good as the enforcement around them:

- `bg-[--color-x]` is Tailwind **v3** syntax. In v4 it compiles to
  `background-color: --color-x`, which is not a valid declaration and which browsers drop
  silently. Every gate passed while the page rendered unstyled. ESLint now blocks the pattern —
  and the rule ships with a probe proving it fails on a real violation.
- A token can be wrong. `--color-success` and `--color-warning` shipped at 3.30:1 and 3.19:1,
  below WCAG AA, and `brand-blue-600` on a `brand-blue-100` tint at 4.24:1. jsdom computes no
  colour, so nothing but the real-browser axe run could catch any of them.

Charts are the standing exception: Recharts fills an SVG `<Cell>` with a colour, not a class, so
`features/reports/components/reportPalette.ts` holds hex values that mirror the tokens. That
duplication is real; keeping it in one small module makes it a five-second fix rather than a hunt.
