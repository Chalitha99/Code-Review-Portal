/**
 * `@sdp/types` — the type-only face of `@sdp/contracts`.
 *
 * Zero runtime: consumers that only need shapes (components, props, test
 * fixtures) import from here and never pull Zod into their bundle. Consumers
 * that need to *validate* import the schemas from `@sdp/contracts` directly.
 *
 * Keeping the two apart also gives us a stable type-name surface: a schema can
 * be renamed or restructured in contracts without breaking every call site, as
 * long as the exported type name here stays put.
 */

export type * from '@sdp/contracts';
