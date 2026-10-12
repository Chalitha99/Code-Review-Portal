/**
 * Dense 1..n ordering for admin-sorted lists (task types, checklist categories,
 * checklist questions).
 *
 * Responses always report an item's position, derived from the stored sort
 * key, so lists stored before positions were dense (0-based or with gaps) still
 * read as 1..n without rewriting existing rows. Every write renumbers 1..n.
 */

/** `ids` with `movedId` taken out and put back at 1-based `position` (clamped). */
export function moveToPosition(
  ids: readonly string[],
  movedId: string,
  position: number,
): string[] {
  const rest = ids.filter((id) => id !== movedId);
  const index = Math.min(Math.max(Math.trunc(position) - 1, 0), rest.length);
  return [...rest.slice(0, index), movedId, ...rest.slice(index)];
}
