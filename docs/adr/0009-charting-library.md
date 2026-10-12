# 0009 · Recharts stays; the effort goes into presentation, not a replacement

**Status:** Accepted · **Date:** Phase 1, Analytics rebuild · **Decided with:** the business

## Context

The business asked for "a modern, stable charting library" with strong TypeScript support, good
React and Tailwind interop, active maintenance, responsive layout, and modern interactions —
tooltips, legends, animations, accessibility — because the charts on Developer Analytics and Admin
Reports did not look like a current production application.

The premise deserves examining before it is acted on. **The application already uses Recharts
3.10.1**, and has since the Reports screens were built ([frontend-standards §11](../frontend-standards.md)).
It was a considered choice, not an accident.

Measured against the stated criteria, the incumbent already meets every one:

| Requirement                     | Recharts 3.10.1                                                   |
| ------------------------------- | ----------------------------------------------------------------- |
| Strong TypeScript support       | Ships its own types; no `@types/*` package                        |
| Works well with React           | React components, not a wrapped imperative canvas library         |
| Works with Tailwind             | Renders SVG; no stylesheet of its own to fight the token layer    |
| Actively maintained, production | Yes — v3 is current                                               |
| Provides the chart types needed | The app draws donuts and meters. Nothing else is required         |
| Responsive                      | `ResponsiveContainer`, already in use                             |
| Tooltips, legends, animations   | All present; what we use of them is a design decision — see below |

So the real finding was that **the presentation was thin, not that the library was wrong.** The
charts had `isAnimationActive={false}`, a legend showing percentages with no counts, no hover or
focus affordance of any kind, and — worst — two separate colour maps that had silently drifted, so
Approved was `#166534` on Analytics and `#15803d` on Reports.

## Decision

**1. Keep Recharts.** Replacing it would add a dependency that does nothing the incumbent cannot,
rewrite both chart screens and their tests, and change the code-split shape described in
frontend-standards §18. [Standard §24](../frontend-standards.md) requires every dependency to be
justified; "the charts look dated" does not justify one when the charts were simply not finished.

**2. Spend the budget on presentation instead.** Consistent ring geometry across all three donuts,
counts alongside percentages, a slice-highlight interaction, aligned typography and spacing, an
entry animation, and a per-customer panel that reads as a designed block rather than a list.

**3. One palette, in `components/charts/chartPalette.ts`.** A feature may not import another
feature (§2), so the shared map lives in `components/` and `features/reports/components/reportPalette.ts`
re-exports from it, keeping only its own `Slice`-shape adapter.

**4. Interaction lives in the LEGEND, not in a `<Tooltip>`.** Hovering or focusing a legend row
dims the other slices. This falls out of an existing constraint and improves on it: the chart's SVG
subtree is `inert` (§10, after a real defect where a Recharts SVG took focus while `aria-hidden`),
and `inert` removes pointer events, so a Recharts tooltip cannot fire there at all. Making the
legend interactive puts the affordance on the surface that is already the accessible presentation of
the data, and gives keyboard users the same thing pointer users get.

**5. Animation is gated on `prefers-reduced-motion` in JavaScript.** Recharts animates SVG
attributes from JS, which the global `prefers-reduced-motion` block in `global.css` cannot reach —
that block only neutralises CSS animations and transitions. `DonutChart` reads the query through
`hooks/useMediaQuery.ts` and passes `isAnimationActive={!prefersReducedMotion}`.

## Alternatives considered

- **Nivo.** Genuinely good, and the richest chart catalogue of the three. Rejected: it brings a d3
  dependency tree for chart types this application does not draw, and its theming wants a JS theme
  object, which is a second source of truth beside the token file.
- **visx.** The most flexible, and the best answer if the product ever needs a bespoke chart. It is
  primitives rather than charts, so a donut with a legend is code we would own and maintain
  ourselves. Rejected as the wrong trade for three donuts and a meter — revisit if a genuinely
  custom visualisation is ever specified.
- **Tremor.** Fastest route to a modern-looking dashboard, and it is Tailwind-native. Rejected for
  the same reason MUI was rejected in §24: it is a second design system, with its own card, its own
  KPI tile and its own colour scale, all of which already exist here and are already tokenised.
- **Do nothing.** Rejected. The business's complaint about the charts was accurate even though its
  proposed cause was not.

## Consequences

**Good.** No new dependency, no bundle regression, no rewrite of the Reports screens. Both chart
screens improve at once because both consume the same two wrapped components, and the colour drift
between them is now impossible rather than merely unlikely.

**The cost.**

- **The stated requirement is not literally satisfied.** Nobody introduced a new library. If the ask
  was really "adopt a named library", this record is the disagreement, in writing.
- ~~**No hover tooltip on the arcs themselves**, and there cannot be one while the SVG is `inert`.~~
  **Superseded — see the amendment below.**
- **`chartPalette.ts` still duplicates hex values from `tailwind.tokens.css`.** Unavoidable: Recharts
  fills a `<Cell>` with a colour, not a class. It is one file instead of two, which makes it a
  five-second fix rather than a hunt — but it is still a fix somebody has to remember to make.
- **The Recharts chunk is now named after `chartPalette`** in the build output, because that module
  is the shared entry into the lazy group. Cosmetic, but it will confuse the next person reading a
  bundle report.

---

## Amendment · Tooltips are possible after all — `tabIndex`, not `inert`

**Date:** Phase 1, Reviewer Analytics · **Amends:** decision 4 and the second cost above

The business came back asking for real hover interaction on the charts. This record had said that
was impossible, and this record was wrong — not about the accessibility requirement, but about the
only way to meet it.

**What was missed.** `inert` was chosen because `accessibilityLayer={false}` is only a _request_
that Recharts may stop honouring, and a focusable element inside an `aria-hidden` subtree is a real
defect that shipped once. Both of those remain true. But Recharts 3.10's `RootSurface` reads:

```js
tabIndex =
  typeof otherAttributes.tabIndex === 'number'
    ? otherAttributes.tabIndex // an explicit prop wins outright
    : hasAccessibilityLayer
      ? 0
      : undefined;
```

An explicit `tabIndex={-1}` is therefore **our value, not a request** — a stronger guarantee than
`accessibilityLayer={false}` ever offered, and strictly narrower than `inert`, because it removes
the element from the tab order without removing pointer events. `inert` was solving the right
problem with the biggest available hammer.

**Revised decision.** Every chart is `aria-hidden` on the wrapper and `tabIndex={-1}` on the chart.
`<Tooltip>` is now not just allowed but expected: a shared `ChartTooltip` renders the same card on
the donuts, the area chart and the bar chart. The legend interaction from decision 4 stays exactly
as it was — the two compose, and the legend remains independently usable, which is what keyboard
users rely on.

**A trap this exposed, which cost a red build to find.** `Pie` emits a _second_ `tabindex` on its own
`<g class="recharts-pie">` layer from a separate `rootTabIndex` prop that also defaults to `0`. The
chart-level prop is necessary and not sufficient. `Bar`, `Area` and `Line` have no equivalent, so
this is a `Pie` speciality and exactly the kind of thing that will be true of the next mark type
somebody adds. The browser axe run caught it; `e2e/reviewer.spec.ts` now also asserts directly that
every `[tabindex]` inside an `aria-hidden` subtree is `-1`.

**What this costs.** The accessibility contract is now spread over two attributes on two elements
instead of one attribute on one, and getting either wrong fails silently in jsdom. That is why the
guard is asserted twice — once through axe, once as a bare DOM assertion — rather than trusted to a
code comment.
