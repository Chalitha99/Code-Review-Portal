/**
 * The thresholds every KPI indicator in the product compares against.
 *
 * They live in `lib/` because three features need them and ESLint's `boundaries`
 * rule forbids a feature from importing a sibling — cross-feature reuse has to be
 * named and owned somewhere shared, which is exactly what this file is. Reports
 * owned them before; Developer Analytics could not import that module, so it
 * re-typed the numbers as literals and one of them was WRONG.
 *
 * The defect that caused this file to exist:
 *
 *   Developer Analytics  `metrics.approvalRate >= 50`
 *   Admin Reports        `approvalRate >= APPROVAL_RATE_TARGET` (70)
 *
 * The same FL 2.4.3 indicator, over the same data, reading "On target" for a
 * developer and "Below target" for the administrator looking at that developer.
 * A duplicated threshold is not a duplicated constant; it is two different
 * business rules that happen to look alike until one of them drifts.
 *
 * Anything comparing a KPI against a number belongs here. Nothing else does —
 * this file must stay free of arithmetic so that a threshold change is provably
 * a threshold change.
 */

/**
 * ⚠️ OPEN BUSINESS QUESTION — the value below is not signed off.
 *
 * FL 2.4.3 Logic 2 requires an approval-rate target so the card can read "Below
 * target" or "On target", and the specification never gives a number. 70 is a
 * placeholder chosen so the indicator is exercised, and the screens that use it
 * say so on the card (`common.kpi.targetNote`) rather than presenting it as
 * agreed.
 *
 * It must be signed off before Phase 2, and it lives here as ONE named constant
 * precisely so that sign-off is a one-line change. See
 * `docs/architecture.md` § "Open items needing business input".
 */
export const APPROVAL_RATE_TARGET = 70;

/**
 * Above this, the average cycle count is flagged as high.
 *
 * Same caveat as the target above: FL 2.4.3 asks for the indicator without
 * naming the number.
 */
export const HIGH_CYCLE_THRESHOLD = 2;

/**
 * At or below this, average quality rank reads as good.
 *
 * Note the comparison is INVERTED against every other threshold here, because 1
 * is the best rank and 3 the worst (FS 2.9.2.5). A call site that writes
 * `>= GOOD_RANK_THRESHOLD` has the sense backwards.
 */
export const GOOD_RANK_THRESHOLD = 1.5;

/**
 * Approval rates that band a reviewer as lenient or strict.
 *
 * These describe a reviewer's habits rather than grading their performance —
 * a reviewer working on a fragile subsystem SHOULD send more back — so they are
 * separate constants from `APPROVAL_RATE_TARGET` even though one currently
 * shares its value. Collapsing them would mean signing off the approval-rate
 * target silently re-labelled every reviewer.
 */
export const LENIENT_APPROVAL_RATE = 70;
export const STRICT_APPROVAL_RATE = 30;
