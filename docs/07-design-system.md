# Design system

Source of truth: the SEBSA Figma file `hWCFN0WnkzrH2Xe6L6BFZq`, page
**🎨 Design System**, frame **01 · Foundations**. Wireframes for the screens are
in `Figma UI Wireframes/` in the repo.

Token names mirror Figma's groups so a designer and a developer can point at the
same name. **Nothing downstream hardcodes a hex value.**

## Tokens

All tokens are declared in `src/styles/Themes.css` — `@theme` for anything
Tailwind should generate utilities for, `:root` for gradients and chart colours.

### Brand

| Token                 | Value                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------- |
| `--color-primary-600` | `#5827e5` — the brand violet                                                                        |
| `--color-primary-100` | `#e4dcfc`                                                                                           |
| `--color-primary-50`  | `#f3f0fe`                                                                                           |
| `--color-brand-navy`  | `#00276a`                                                                                           |
| logo ramp             | cyan `#03cff0` · blue `#028bde` · violet `#7650e1` · light violet `#9b83f2` · deep purple `#6600cc` |

### Surface, text, border

| Group   | Tokens                                                                                                       |
| ------- | ------------------------------------------------------------------------------------------------------------ |
| Surface | `page #f9fafc`, `surface #ffffff`, `surface-subtle #f5f7fb`, `surface-hover #eff2f8`, `surface-hero #f1f2fc` |
| Text    | `heading #00276a`, `ink #152744`, `secondary #5a6784`, `muted #66738f`, `inverse #ffffff`, `link #5827e5`    |
| Border  | `border #e3e8f1`, `border-subtle`, `border-strong`, `border-focus`                                           |

### Status

Each status is a tinted background, a readable foreground, and where the design
defines one, a solid fill. **Every FG-on-BG pair is verified at ≥ 4.5:1.**

| Status  | bg        | fg        | solid     |
| ------- | --------- | --------- | --------- |
| success | `#dff7e8` | `#0b7a45` | `#0fa556` |
| warning | `#fef3d7` | `#95650a` | `#e9a21b` |
| danger  | `#fde5e5` | `#c62b2b` | `#e14343` |
| info    | `#dbe5fb` | `#1b54d8` | —         |
| neutral | `#eff2f8` | `#47536e` | —         |
| purple  | `#e4dcfc` | `#5827e5` | —         |

**The `solid` colours are fills, not text colours.** White on `success-solid` is
3.3:1 and white on `warning-solid` is 2.2:1 — both fail. A filled badge uses the
`fg` token for its text, or dark ink. This is the single most common mistake
when adding a status, and the Storybook axe gate catches it.

### Roles

| Role      | Base      | Gradient start |
| --------- | --------- | -------------- |
| Developer | `#3b82f6` | `#60a5fa`      |
| Reviewer  | `#6600cc` | `#7650e1`      |
| Admin     | `#8b5cf6` | `#a78bfa`      |

### Shape and type

`--radius-control 8px`, `--radius-card 12px`, `--radius-panel 16px`;
`--shadow-card`, `--shadow-raised`, `--shadow-popover`, all tinted with the navy
rather than pure black.

**Poppins for headings, Inter for everything else** — `--font-heading` and
`--font-sans`. Using Inter throughout, as an earlier pass did, loses the
distinction the type scale is built on.

## Gradients

Figma cannot bind gradient stops to variables, so each gradient is composed in
`:root` from its stop tokens.

| Gradient                                        | Use                                                       |
| ----------------------------------------------- | --------------------------------------------------------- |
| `--gradient-brand`                              | `#1b54d8 → #5827e5`, 90° — primary buttons, brand accents |
| `--gradient-developer` / `-reviewer` / `-admin` | Workspace card accents                                    |
| `--gradient-brand-panel`                        | 140° through the logo ramp — the login brand panel        |

Applied through the `bg-gradient-*` utilities in `src/styles/utilities.css`, not
with inline `style`.

## Chart colour — the split rule

**Colour choice depends on the job the colour is doing.** This is a deliberate
policy, not an inconsistency.

### Status charts — the design system's own hues

`--status-chart-green`, `-red`, `-amber`, `-orange`, `-violet`, `-track`.

Used where the colour carries meaning the reader already holds: green is
approved, red is a serious issue. Repainting those to satisfy a colourblind
metric would make the chart _harder_ to read for everyone.

The trade-off is real and it is paid for explicitly: this green and red sit
**ΔE 3.2 apart under deuteranopia** and cannot be told apart by hue alone. So
every status chart is required to render **a legend with counts and
percentages**, which means colour is never the sole encoding — WCAG 1.4.1 is
satisfied by the secondary encoding, not by the hue.

### Categorical series — the validated ramp

`--chart-1` … `--chart-6`, in fixed order.

Used for series where no hue carries inherent meaning — per customer, per
developer, per task type. This ramp was validated for lightness band, chroma
floor, adjacent-pair CVD separation and contrast against the chart surface. **Its
order is part of the contract**: assign in sequence, never cycle, never
reorder. A seventh series folds into "Other" or becomes small multiples.

### Rules for both

- One y-axis. Never a dual-axis chart.
- Colour follows the entity, never its rank — filtering must not repaint the
  survivors.
- Text wears text tokens, never the series colour.
- A legend is always present for two or more series; four or fewer are also
  directly labelled.
- Status hues are reserved. `--status-chart-green` is never "series 4".

## Contrast

WCAG 2.1 AA: 4.5:1 for body text, 3:1 for large text and for UI component
boundaries. Verified by axe on every Storybook story at `error` severity, and by
`@axe-core/playwright` on every mounted route.

Failures found and fixed during development, kept here because each is a trap
that will be walked into again:

| Attempted                         | Ratio  | Fix                                     |
| --------------------------------- | ------ | --------------------------------------- |
| White on `success-solid`          | 3.3    | `success-fg` on the tint                |
| White on `warning-solid`          | 2.2    | Dark ink                                |
| Tinted text dimmed with `opacity` | varies | Weight and size instead — never opacity |
| `text-muted` on `surface-subtle`  | 4.43   | `text-secondary` (5.28)                 |
| White on `danger-solid` (badge)   | 4.12   | `danger-fg`                             |

**The rule that generalises: never express de-emphasis with `opacity`, and never
put `text-muted` on anything but `surface` or `page`.**

## Motion

Motion is meaning, not decoration: it shows where a thing came from and that it
is interactive.

- Entrances: `enter-up`, 420ms, staggered via `--enter-delay`.
- Hover lift on workspace cards: `translateY(-6px)` over 220ms with a **90ms
  delay on the way in and 0ms on the way out**, so it eases up deliberately and
  snaps back immediately. Paired with `:focus-within` so keyboard users get it.
- Everything motion-related is inside
  `@media (prefers-reduced-motion: no-preference)`.

## Where CSS is allowed

Utilities in JSX are the default. `src/styles/Pages.css` admits only three
things, and the rule is stated in the file:

1. `@keyframes`
2. selectors utilities cannot express (`:focus-within` combinations, `::selection`)
3. a multi-stop gradient reused in three or more places

Everything else is a utility class. If you find yourself adding a fourth
category, the component wants a variant instead.
