/**
 * Hardcoded application values.
 *
 * The rule that separates this folder from `src/config/`: everything here is
 * identical in every environment, on every machine, forever. It is pure data
 * with no I/O, so it can be imported from a Node script or a test with no
 * setup. Anything that reads `import.meta.env` belongs in `src/config/`.
 *
 */

export * from './portals';
export * from './roles';
export * from './routePaths';
