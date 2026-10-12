/**
 * The non-component half of `ChartTooltip` — the wrapper contract every chart
 * shares, and the narrowing helpers for the payload Recharts hands it.
 *
 * Recharts types that payload as `any`, so every chart that reached into
 * `props.payload[0].value` tripped `no-unsafe-member-access`. A cast would have
 * silenced it and lied: at runtime the array really can be empty, and `value`
 * really can be `undefined` while an animation is mid-flight. These narrow
 * instead, returning `undefined` for anything that is not the shape we expect —
 * which is what lets a caller render nothing rather than a tooltip full of
 * `NaN`.
 *
 * A separate `.ts` file rather than exports from `ChartTooltip.tsx`, because a
 * module that exports both a component and a function breaks React Fast Refresh
 * (standard §19) — the same reason `hoverLift.ts` sits beside its card and
 * `buttonVariants.ts` beside its button.
 */

/**
 * Puts the tooltip on the app's popover tier.
 *
 * Recharts gives `.recharts-tooltip-wrapper` `position: absolute` and NO
 * `z-index`. In the donut that wrapper and the centre-label overlay are
 * siblings inside one `relative` box, both at `z-index: auto` — so CSS paints
 * them in DOM order and the label, being the later child, lands on top of the
 * tooltip. That is the "8 tasks" showing through the card; the tooltip's
 * background is opaque, so it was paint order, never translucency.
 *
 * `wrapperStyle` is the supported hook: `TooltipBoundingBox` spreads it LAST
 * over its own style object, and it targets the wrapper itself — the element
 * that actually competes. `50` is this app's popover tier, shared with `Dialog`,
 * `Select`, `NotificationBell` and `UserChip`. `ChartTooltip` already borrows
 * their `shadow-popover` token, so the tier was the only part of the popover
 * contract it was missing.
 *
 * TWO THINGS THAT LOOK RIGHT AND ARE NOT, so nobody re-derives them:
 *
 * - `z-index` on `ChartTooltip`'s own div does nothing. Its parent wrapper
 *   carries a `transform`, which makes it a stacking context; a child's
 *   `z-index` can never lift it above a sibling outside that context.
 * - `<Tooltip portal={...}>` is worse than it sounds. `TooltipBoundingBox` reads
 *   `hasPortalFromProps ? {} : {…transform, position, top, left…}`, so passing a
 *   portal makes Recharts drop ALL positioning and hand back a card we would
 *   have to place against the pointer ourselves.
 */
export const CHART_TOOLTIP_WRAPPER_STYLE = { zIndex: 50 } as const;

/**
 * Lets the tooltip sit outside the plotting area.
 *
 * Only for charts whose plot is NARROWER than the tooltip — in practice the
 * donut, whose ring box is 168px against a `min-w-44` (176px) card. With the
 * default `{x: false, y: false}` Recharts clamps the tooltip inside the view
 * box: `getTooltipTranslateXY` returns `Math.max(negative, viewBoxKey)` as soon
 * as `coordinate + offset + tooltipWidth` exceeds the box edge, which for a
 * tooltip wider than the whole box is unconditionally true and collapses to
 * `0`. The tooltip was pinned to the ring's top-left corner — over the centre
 * label — wherever the pointer actually was.
 *
 * Do NOT apply this to the cartesian charts. There the clamping IS the wanted
 * behaviour: it flips the tooltip to the other side of the cursor near an edge,
 * and their plots are far wider than the card, so it never degenerates.
 */
export const CHART_TOOLTIP_ESCAPE = { x: true, y: true } as const;

export interface ChartTooltipPoint {
  dataKey: string | undefined;
  value: number | undefined;
  /** The original datum. `unknown` — read it with `tooltipDatum`. */
  payload: unknown;
}

export function tooltipPoints(payload: unknown): ChartTooltipPoint[] {
  if (!Array.isArray(payload)) return [];

  return (payload as unknown[]).map((entry) => {
    const record = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<
      string,
      unknown
    >;
    return {
      dataKey: typeof record['dataKey'] === 'string' ? record['dataKey'] : undefined,
      value: typeof record['value'] === 'number' ? record['value'] : undefined,
      payload: record['payload'],
    };
  });
}

/**
 * The datum behind a point, if it carries the field that identifies it.
 *
 * A structural check rather than a cast: `id` is what every chart in this
 * product keys its data by, so its presence is the cheapest honest evidence that
 * the payload is ours and not something Recharts synthesised.
 */
export function tooltipDatum<TDatum extends { id: string }>(payload: unknown): TDatum | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;
  return 'id' in payload ? (payload as TDatum) : undefined;
}
