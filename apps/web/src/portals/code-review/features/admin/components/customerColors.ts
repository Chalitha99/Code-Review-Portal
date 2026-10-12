/**
 * The customer colour palette (Add Customer modal, screen 03).
 *
 * A fixed palette rather than a free colour input, for a reason that outlives
 * the wireframe: this colour is rendered as the left accent bar and the chip
 * text on every task row, so an arbitrary hex can produce an unreadable chip.
 * Every swatch here was checked against the chip's tinted background.
 *
 * Kept in `features/admin` because only the Add/Edit Customer form offers a
 * choice — everywhere else reads `customer.color` off the record.
 */

export interface CustomerColor {
  /** Stable key, used as the swatch's accessible name. */
  name: string;
  hex: string;
}

export const CUSTOMER_COLORS: readonly CustomerColor[] = [
  { name: 'Blue', hex: '#2563eb' },
  { name: 'Emerald', hex: '#059669' },
  { name: 'Violet', hex: '#7c3aed' },
  { name: 'Orange', hex: '#ea580c' },
  { name: 'Red', hex: '#dc2626' },
  { name: 'Amber', hex: '#b45309' },
  { name: 'Teal', hex: '#0d9488' },
  { name: 'Indigo', hex: '#4f46e5' },
  { name: 'Pink', hex: '#db2777' },
  { name: 'Cyan', hex: '#0891b2' },
  { name: 'Lime', hex: '#4d7c0f' },
  { name: 'Fuchsia', hex: '#c026d3' },
  { name: 'Rose', hex: '#e11d48' },
  { name: 'Sky', hex: '#0284c7' },
  { name: 'Slate', hex: '#475569' },
];

/**
 * The "Auto" swatch in the wireframe, resolved at pick time.
 *
 * Deterministic on the name rather than random: reopening the form for the same
 * customer must not offer a different colour, and two admins typing the same
 * name get the same result.
 */
export function autoColor(name: string): string {
  let hash = 0;
  for (const character of name) {
    hash = (hash * 31 + character.charCodeAt(0)) % 2147483647;
  }
  const index = hash % CUSTOMER_COLORS.length;
  return CUSTOMER_COLORS[index]?.hex ?? '#2563eb';
}

export function colorName(hex: string): string | undefined {
  return CUSTOMER_COLORS.find((color) => color.hex.toLowerCase() === hex.toLowerCase())?.name;
}
