import type { Slice } from '../domain/reportMetrics.ts';
import type { DonutSlice } from '@/components/common/charts/DonutChart.tsx';
import {
  CHART_FALLBACK_COLOR,
  CYCLE_COLORS,
  RANK_COLORS,
  STATUS_COLORS,
} from '@/portals/code-review/components/charts/chartPalette.ts';

/**
 * Reports' `Slice` shape adapted to the shared `DonutSlice`.
 *
 * The colours themselves moved to `components/charts/chartPalette.ts` — the
 * developer Analytics screen draws the same three distributions and had its own
 * drifting copy. What is left here is the shape adapter, which is genuinely this
 * feature's own: `Slice` is a `reportMetrics` type.
 */

function toDonut(slices: readonly Slice[], colors: Record<string, string>): DonutSlice[] {
  return slices.map((slice) => ({
    id: slice.key,
    label: slice.label,
    value: slice.value,
    color: colors[slice.key] ?? CHART_FALLBACK_COLOR,
  }));
}

export function statusSlices(slices: readonly Slice[]): DonutSlice[] {
  return toDonut(slices, STATUS_COLORS);
}

export function rankSlices(slices: readonly Slice[]): DonutSlice[] {
  return toDonut(slices, RANK_COLORS);
}

export function cycleSlices(slices: readonly Slice[]): DonutSlice[] {
  return toDonut(slices, CYCLE_COLORS);
}
