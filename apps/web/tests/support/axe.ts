import axe, { type Result } from 'axe-core';

/**
 * Runs axe against a rendered container and returns only the findings we treat
 * as build-breaking.
 *
 * Scoped to `critical` and `serious`: `moderate` and `minor` include things like
 * heading-order preferences that are worth reviewing but not worth failing a
 * build over, and a noisy gate gets muted rather than fixed.
 *
 * Automated checks catch roughly a third of real accessibility problems. This
 * complements the keyboard and screen-reader passes; it does not replace them.
 */
const BLOCKING_IMPACTS = new Set(['critical', 'serious']);

export async function findBlockingA11yViolations(container: HTMLElement): Promise<Result[]> {
  const results = await axe.run(container, {
    resultTypes: ['violations'],
    rules: {
      // Requires a full page with landmarks; the tests render fragments, so it
      // would fire on every component test regardless of real quality.
      region: { enabled: false },
    },
  });

  return results.violations.filter((v) => BLOCKING_IMPACTS.has(v.impact ?? ''));
}

/** Formats violations so a failure names the element and the fix, not just a rule id. */
export function formatViolations(violations: Result[]): string {
  return violations
    .map((v) => {
      const nodes = v.nodes.map((n) => `      ${n.html}`).join('\n');
      return `  [${v.impact ?? 'unknown'}] ${v.id}: ${v.help}\n${nodes}`;
    })
    .join('\n');
}
