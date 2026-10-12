import home from './home.json';
import a11y from './a11y.json';

/**
 * Every user-facing string in one typed catalog.
 */
export const content = {
  a11y,
  home,
} as const;

/**
 * Substitutes `{name}` placeholders.
 *
 * Deliberately tiny: this is string interpolation.
 */
export function t(template: string, values: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : String(value);
  });
}
