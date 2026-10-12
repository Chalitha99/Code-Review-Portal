# Accessibility

**Target: WCAG 2.1 Level AA.** This is an internal tool used all day by people
who did not choose it, which is exactly the case where accessibility is not
optional.

## The gates

Accessibility is checked automatically in two places, both of which fail the
build:

| Gate                                                      | What it covers                                   |
| --------------------------------------------------------- | ------------------------------------------------ |
| Storybook + `@storybook/addon-a11y`, `test.a11y: "error"` | Every story of every component, in real Chromium |
| `@axe-core/playwright` in `e2e/accessibility.spec.ts`     | Every mounted route, fully composed              |

Component-level and page-level are different problems: a `Button` can pass in
isolation and still fail on a tinted card, and a page can have two `<nav>`
landmarks that no single component could see.

Automated checks catch roughly half of what matters. The rest is the manual pass
below.

## Manual pass, before merging UI

1. **Tab through it.** Every interactive element reachable, in visual order,
   with a visible focus ring. Nothing reachable that shouldn't be.
2. **Do it without the mouse.** Enter and Space activate; Escape closes; a
   dialog traps focus and returns it to the trigger on close.
3. **Zoom to 200%.** No clipping, no horizontal scroll.
4. **Turn on `prefers-reduced-motion`.** Everything still works; nothing moves.
5. **Greyscale it.** Every status still readable — if the only difference is
   hue, it is broken.

## Rules

### Semantics first

A `<button>` is a button. `role="button"` on a `<div>` means reimplementing
focus, Enter, Space, and disabled state, and getting one of them wrong.

One `<h1>` per page; heading levels never skip. One `<main>`, one `<nav>`, one
`<header>` — the `Stepper` is an `<ol aria-label>` rather than a `<nav>`
precisely because a second navigation landmark breaks `landmark-unique`, and a
progress indicator is not navigation.

### Never colour alone

Every status carries an icon or text as well as a tint. Unread notifications are
signalled three ways: a dot, a heavier title, and visually hidden "Unread" text.
Charts carry a legend with counts and percentages — which is what lets the
status palette use the design's own green and red despite their ΔE 3.2
separation under deuteranopia.

### Never `opacity` for de-emphasis

Dimming tinted text with `opacity` produces a colour nobody chose and no
contrast tool predicted. Use a lighter _token_, or a smaller size and lighter
weight. This caused a real failure during development.

### Labels

Every input has a real `<label>`. `Field` wires `htmlFor`, `aria-describedby`,
`aria-invalid` and `role="alert"` on the error — assemble a field by hand and it
will not be accessible.

Icon-only buttons get an `aria-label` that says the action, not the icon:
"Notifications, 3 unread", never "bell".

### Live regions

Errors are announced with `role="alert"`. Async results that appear without a
navigation get `aria-live="polite"`. Sonner toasts are already live regions —
don't wrap them in another.

### Focus management

- Dialogs and popovers trap focus and restore it to the trigger. Radix does this;
  don't fight it.
- After a failed submit, focus moves to the first invalid field.
- After a route change, focus moves to the heading.
- A skip link is the first focusable element on the page.

### Tables

`DataTable` sets `aria-sort` on sortable headers.

**Rows stay rows.** No `role`, no `tabIndex` on a `<tr>` — overriding a row's
implicit role removes it from the table's structure, and a screen-reader user
can then no longer navigate the grid as a table at all. `onRowClick` is a mouse
convenience; the keyboard path is the row's own action control, which every grid
in the wireframes has. `DataTable.test.tsx` guards this in both directions.

> This section used to say the opposite — that clickable rows should carry
> `role="button"`, `tabIndex={0}` and a `rowLabel`. That was tried, and it is
> what removed the rows from the grid. The advice is corrected rather than
> deleted because it is the plausible-sounding wrong answer, and someone will
> reach for it again.

**Reordering** ([ADR 0011](./adr/0011-row-reordering.md)) follows the same
rule: the drag handle is a real `<button>` in its own cell, never attributes on
the row. Native drag is pointer-only, so the handle also takes ArrowUp/ArrowDown
— without that the feature would be unusable by keyboard, which the manual pass
above forbids.

### Motion

All of it inside `@media (prefers-reduced-motion: no-preference)`. Nothing
flashes more than three times per second.

## Known quirks

**Radix RadioGroup does not select on arrow keys.** Verified against a bare
`@radix-ui/react-radio-group` probe in both jsdom and real Chromium. Tests assert
focus movement plus Space, because that is what actually happens.

**Contrast traps, all of them hit at least once:**

| Attempted                        | Ratio | Use instead              |
| -------------------------------- | ----- | ------------------------ |
| White on `success-solid`         | 3.3   | `success-fg` on the tint |
| White on `warning-solid`         | 2.2   | Dark ink                 |
| White on `danger-solid`          | 4.12  | `danger-fg`              |
| `text-muted` on `surface-subtle` | 4.43  | `text-secondary`         |

The generalisation: **`text-muted` belongs on `surface` or `page` only**, and
the `*-solid` tokens are fills, never text colours.
