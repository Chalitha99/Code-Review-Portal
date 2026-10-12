# Definition of done

## Before you open a pull request

```bash
npm run lint && npm run format:check && npm run typecheck \
  && npm test && npm run test:storybook && npm run test:e2e && npm run build
```

All eight must pass. CI runs the same gates, so a failure here is a failure
there — just slower and more public.

## Checklist

### Correctness

- [ ] It does what the ticket asked, including the edge cases
- [ ] Loading, empty, error and success states all exist and were looked at
- [ ] No `console.log` left behind
- [ ] No commented-out code

### Types

- [ ] No `any`. `unknown` plus narrowing where the type is genuinely unknown
- [ ] Payload types inferred from Zod schemas, not hand-written
- [ ] `noUncheckedIndexedAccess` handled properly — no `!` outside tests

### Architecture

- [ ] The file is in the right folder ([folder structure](./03-folder-structure.md))
- [ ] No layering violation — ESLint will tell you, but understand _why_ if it does
- [ ] Business rules are pure functions in `domain/`, not inside a component
- [ ] Fetching is in `api/` hooks, not in a component
- [ ] No path literals — everything from `routePaths`
- [ ] No user-facing string literals — everything from `content/`

### UI

- [ ] Tokens only, no hardcoded colours
- [ ] Reused an existing component before adding one
- [ ] Responsive at 360, 768, 1024 and 1440
- [ ] Motion inside `prefers-reduced-motion: no-preference`

### Accessibility

- [ ] Storybook axe passes at `error`
- [ ] Tabbed through it; focus visible and ordered
- [ ] Works without a mouse — Enter, Space, Escape
- [ ] No colour-only signals
- [ ] Icon-only buttons have an `aria-label` naming the action

### Tests

- [ ] New domain function has unit tests
- [ ] New shared component has a story
- [ ] New user journey has an e2e test
- [ ] Tests query by role and name, and assert behaviour rather than implementation
- [ ] A bug fix ships with the test that would have caught it

### Documentation

- [ ] Non-obvious decisions have a comment saying _why_
- [ ] An architectural decision gets an [ADR](./adr/)
- [ ] A new dependency is justified in [dependency governance](./15-dependency-governance.md)
- [ ] Docs updated if behaviour they describe changed

## Reviewing

Look for, in this order:

1. **Is it correct?** Read it as if it will fail. What input breaks it?
2. **Is it in the right place?** Wrong folder now is a refactor later.
3. **Will the next person understand it?** If you had to reread it twice, it
   needs a comment or a better name.
4. **Is it consistent?** Same problem, same solution as elsewhere in the repo.
5. **Is it tested at the right tier?** A domain rule tested through a form is a
   test that will break for unrelated reasons.

Comment on what matters and say so plainly. Prefix anything optional with
"nit:" so the author can tell a preference from a problem. Approve when it is
better than what is there; perfection is not the bar.

## Merging

- Branch from `develop`, merge back to `develop`
- Branch names: `feature/<short-description>`, `fix/<short-description>`
- Commits in the imperative mood: "Add checklist versioning", not "Added"
- Green CI is required
- Squash unless the individual commits genuinely tell a story
