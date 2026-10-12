# Review Cycle Counting Scenarios

Code Review Portal: review-round and counted-cycle behavior, including developer rejection of reviewer findings.

**Starting state:** When the developer first submits a task for review, Review Round = 0 and Cycle = 0. Review Round becomes 1 only when the reviewer actually starts the first review.

**Legend:** Round = Review Round (never decreases). Counted = number of cycles (only cycles with `counted=true`).

---

## Scenario 1 - Normal Review: Direct Approval

| Event | Review Round | Cycle |
|---|---|---|
| Developer submits task for review | 0 | 0 |
| Reviewer reviews first submission | 1 | 0 |
| Reviewer approves directly | 1 | 0 |
| Task is Approved | 1 | 0 |

## Scenario 2 - Normal Request Changes and Fix

| Event | Review Round | Cycle |
|---|---|---|
| Developer submits task for review | 0 | 0 |
| Reviewer reviews first submission | 1 | 0 |
| Reviewer requests changes | 1 | 1 |
| Developer resolves issue(s) and resubmits | 1 | 1 |
| Reviewer reviews again | 2 | 1 |
| Reviewer approves | 2 | 1 |

## Scenario 3 - Repeated Request Changes

| Event | Review Round | Cycle |
|---|---|---|
| Developer submits task for review | 0 | 0 |
| Reviewer reviews first submission | 1 | 0 |
| Reviewer requests changes | 1 | 1 |
| Developer fixes and resubmits | 1 | 1 |
| Reviewer reviews again | 2 | 1 |
| Reviewer requests changes again | 2 | 2 |
| Developer fixes and resubmits | 2 | 2 |
| Reviewer reviews again | 3 | 2 |
| Reviewer approves | 3 | 2 |

## Scenario 4 - Single Issue Rejected by Developer; Reviewer Accepts

The developer believes the only reviewer finding is invalid and rejects it with a reason.

| Event | Issue State | Review Round | Cycle |
|---|---|---|---|
| Developer submits task for review | - | 0 | 0 |
| Reviewer reviews first submission | - | 1 | 0 |
| Reviewer raises Issue A and requests changes | Open | 1 | 1 |
| Developer rejects Issue A and provides reason | Rejected by Developer | 1 | 1 |
| Developer resubmits | Awaiting Reviewer | 1 | 1 |
| Reviewer re-reviews | Under Review | 2 | 1 |
| Reviewer accepts developer rejection | Rejection Accepted | 2 | **0** |
| Task is Approved | Closed | 2 | 0 |

## Scenario 5 - Single Issue Rejected by Developer; Reviewer Rejects

| Event | Issue State | Review Round | Cycle |
|---|---|---|---|
| Developer submits task for review | - | 0 | 0 |
| Reviewer reviews first submission | - | 1 | 0 |
| Reviewer raises Issue A and requests changes | Open | 1 | 1 |
| Developer rejects Issue A and provides reason | Rejected by Developer | 1 | 1 |
| Developer resubmits | Awaiting Reviewer | 1 | 1 |
| Reviewer re-reviews | Under Review | 2 | 1 |
| Reviewer does NOT accept developer rejection | Still Valid | 2 | **2** |
| Reviewer requests changes again | Open | 2 | 2 |
| Developer resolves Issue A and resubmits | Resolved | 2 | 2 |
| Reviewer reviews again | Under Review | 3 | 2 |
| Reviewer approves | Closed | 3 | 2 |

## Scenario 6 - Multiple Issues; Some Resolved, One Rejected, Rejection Accepted

Reviewer raises three findings. Developer resolves Issues B and C, but rejects Issue A. Reviewer accepts the rejection of Issue A.

| Event | Issue A | Issue B | Issue C | Round | Counted |
|---|---|---|---|---|---|
| Developer submits task for review | - | - | - | 0 | 0 |
| Reviewer reviews first submission | - | - | - | 1 | 0 |
| Reviewer requests changes | Open | Open | Open | 1 | 1 |
| Developer response | Reject | Resolve | Resolve | 1 | 1 |
| Developer resubmits | Rejected | Resolved | Resolved | 1 | 1 |
| Reviewer re-reviews | Review | Resolved | Resolved | 2 | 1 |
| Reviewer accepts rejection of A | Accepted | Resolved | Resolved | 2 | 1 |
| Cycle result | Closed | Closed | Closed | 2 | **1** |

**Result:** The cycle remains 1 because the developer had valid findings (B and C) that required correction. Accepting the rejection of only Issue A does not remove the cycle.

## Scenario 7 - Multiple Issues; Developer Rejects All; Reviewer Accepts All

| Event | Issue A | Issue B | Issue C | Round | Counted |
|---|---|---|---|---|---|
| Developer submits task for review | - | - | - | 0 | 0 |
| Reviewer reviews first submission | - | - | - | 1 | 0 |
| Reviewer requests changes | Open | Open | Open | 1 | 1 |
| Developer rejects all findings | Reject | Reject | Reject | 1 | 1 |
| Developer provides reasons and resubmits | Rejected | Rejected | Rejected | 1 | 1 |
| Reviewer re-reviews | Review | Review | Review | 2 | 1 |
| Reviewer accepts all rejection reasons | Accepted | Accepted | Accepted | 2 | **0** |
| Task is Approved | Closed | Closed | Closed | 2 | 0 |

**Result:** The cycle is removed from the counted-cycle metric because all findings that caused the Request Changes were rejected by the developer and all rejection reasons were accepted by the reviewer.

## Scenario 8 - Multiple Issues; Developer Rejects All; Reviewer Rejects One or More

| Event | Issue A | Issue B | Issue C | Round | Counted |
|---|---|---|---|---|---|
| Developer submits task for review | - | - | - | 0 | 0 |
| Reviewer reviews first submission | - | - | - | 1 | 0 |
| Reviewer requests changes | Open | Open | Open | 1 | 1 |
| Developer rejects all findings | Reject | Reject | Reject | 1 | 1 |
| Developer resubmits | Rejected | Rejected | Rejected | 1 | 1 |
| Reviewer re-reviews | Review | Review | Review | 2 | 1 |
| Reviewer accepts A/B but rejects C's reason | Accepted | Accepted | Still Valid | 2 | **2** |
| Reviewer requests changes again | Closed | Closed | Open | 2 | 2 |
| Developer resolves C and resubmits | Closed | Closed | Resolved | 2 | 2 |
| Reviewer reviews again and approves | Closed | Closed | Closed | 3 | 2 |

**Result:** Because at least one developer rejection is not accepted, the reviewer requests changes again and it is treated as a new cycle.

## Scenario 9 - Multiple Issues; Mixed Resolve/Reject; Reviewer Rejects the Rejected Finding

| Event | Issue A | Issue B | Issue C | Round | Counted |
|---|---|---|---|---|---|
| Developer submits task for review | - | - | - | 0 | 0 |
| Reviewer reviews first submission | - | - | - | 1 | 0 |
| Reviewer requests changes | Open | Open | Open | 1 | 1 |
| Developer response | Reject | Resolve | Resolve | 1 | 1 |
| Developer resubmits | Rejected | Resolved | Resolved | 1 | 1 |
| Reviewer re-reviews | Review | Resolved | Resolved | 2 | 1 |
| Reviewer rejects developer reason for A | Still Valid | Resolved | Resolved | 2 | **2** |
| Reviewer requests changes again | Open | Closed | Closed | 2 | 2 |
| Developer resolves A and resubmits | Resolved | Closed | Closed | 2 | 2 |
| Reviewer reviews again and approves | Closed | Closed | Closed | 3 | 2 |

---

## Decision Matrix

| Developer Response | Reviewer Decision | Valid Fixes Existed in Original Cycle? | Cycle Result | Task Result |
|---|---|---|---|---|
| Resolve all | N/A | Yes | Keep counted | Re-review; approve or request changes |
| Reject only issue | Accept rejection | No | Remove that cycle | Approve |
| Reject only issue | Reject rejection | Yes / finding remains valid | New cycle | Request Changes |
| Resolve some + reject some | Accept rejected findings | Yes | Keep counted | Can proceed based on remaining issue states |
| Reject all | Accept all rejections | No | Remove that cycle | Approve |
| Reject all | Reject one or more rejections | Yes / finding(s) remain valid | New cycle | Request Changes |
| Resolve some + reject some | Reject one or more rejection reasons | Yes | New cycle | Request Changes |
