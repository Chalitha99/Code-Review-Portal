/**
 * The SEBSA design system — tier 1.
 *
 * Only the cross-cutting helpers are re-exported here. The components
 * themselves are imported by path (`@/components/ui/Button.tsx`), which keeps
 * the module graph explicit and avoids pulling every primitive into a chunk
 * that needed one of them.
 *
 * Note for anyone adding to this file: a `ui` component must NOT import this
 * barrel to reach `cn` — that is a cycle, because the barrel re-exports the
 * components. Import `./lib/cn` directly.
 */

export { cn } from './lib/cn';
export { SebsaLogo } from './brand/SebsaLogo';
export { InfoTooltip, Tooltip } from './Tooltip';
