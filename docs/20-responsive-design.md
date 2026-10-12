# Responsive design

The Service Delivery Portal is a desktop-first internal tool — reviewers work at
a laptop, all day. But "desktop-first" is a statement about which layout gets
the most attention, not permission to break on a tablet.

## Breakpoints

Tailwind's defaults, unchanged. A custom scale would need a reason, and there
isn't one.

| Prefix | Min width | Typical device |
| ------ | --------- | -------------- |
| —      | 0         | Phone          |
| `sm:`  | 640px     | Large phone    |
| `md:`  | 768px     | Tablet         |
| `lg:`  | 1024px    | Laptop         |
| `xl:`  | 1280px    | Desktop        |
| `2xl:` | 1536px    | Large desktop  |

Write the small layout first and add prefixes upward. `grid gap-4 sm:grid-cols-2 lg:grid-cols-4`
reads as one idea; `grid-cols-4 max-lg:grid-cols-2 max-sm:grid-cols-1` reads as
three exceptions.

## Layout conventions

- Page content caps at `max-w-6xl` and centres, with `px-6 py-8`.
- The app bar spans the viewport but its contents share the same cap, so the
  bar's edges align with the page's.
- Vertical rhythm comes from `flex flex-col gap-6` on the page, not from
  margins on children — one place decides spacing.
- Card grids: one column, two at `sm:`, three or four at `lg:`.

## Tables

The hardest responsive problem here. `DataTable` scrolls horizontally inside its
own container rather than shrinking columns into unreadability, and pagination
controls stack under 640px.

Where a table's information matters more than its shape, a card list at `md:` and
below is the better answer — but only build that when a screen actually needs it.

## Typography and touch

Type scales with the breakpoint on headings only; body text stays 16px, which is
also what stops iOS zooming a focused input.

Interactive targets are at least 44×44px on touch. Icon-only buttons get padding
to reach it even when the icon is 16px.

## What to check

Four widths, every time: **360, 768, 1024, 1440**.

At each one: no horizontal scroll on the page body, no clipped text, no
overlapping elements, and every control reachable.

Then zoom to 200% at 1440 — WCAG 1.4.4 — and confirm the same.

## Rules

- **No fixed pixel widths on layout.** Percentages, `fr`, `max-w-*`.
- **`max-width: 100%` on images**, with explicit `width`/`height` so the layout
  does not shift as they load.
- **Wide content scrolls in its own container**, never the page body.
- **Hover is not a requirement.** Anything reachable only by hover is
  unreachable on touch; pair it with focus or make it always visible.
- **Test the layout, not the device.** Resize the window; a device emulator
  hides the states between breakpoints.
