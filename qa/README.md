# Running a manual test pass

See [docs/24 · Test plan](../docs/24-test-plan.md) for the full strategy —
scope, roles, entry/exit criteria, defect severity. This is the short version
for whoever is executing the suite.

1. `npm install`, then `npm run dev` only — the app serves at
   `http://localhost:5175`. Never use `npm run preview`; it has no mock API.
2. Run the automated preflight gates in
   [`test-cases/TC-ENV-environment.md`](./test-cases/TC-ENV-environment.md)
   first. A red suite blocks the manual pass.
3. Copy [`results/RESULTS-TEMPLATE.md`](./results/RESULTS-TEMPLATE.md) to
   `results/<date>-run-<NN>/results.md` (e.g. `results/2026-09-09-run-01/results.md`)
   and record status/notes there as you go — don't edit the case files
   themselves.
4. Work through `test-cases/*.md` in the order listed in
   [`traceability-matrix.md`](./traceability-matrix.md). Cases within a file
   are sequenced deliberately (shared task/data state) — don't skip around.
5. **Never refresh the browser mid-sequence.** The mock database is in-memory
   and a reload discards everything you created. Each case's Preconditions
   column says whether it needs a fresh reload or continues the prior case.
6. Sign in with the password `Sebsa@2026` for every account listed in
   `src/mocks/data/users.json`. There is no user switcher — cross-user cases
   need a real sign-out and sign-in.
7. Log every Fail with enough detail (screenshot, exact repro steps, expected
   vs. actual) to file a defect. Do not weaken a case to make it pass.
8. When the pass is complete, check the suite against
   [`gap-register.md`](./gap-register.md) — anything failing there because
   the feature isn't implemented is expected, not a new defect.
