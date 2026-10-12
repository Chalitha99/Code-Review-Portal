# Storybook standards

Storybook is not a gallery. It is where components are built, and it is one of
the four test tiers — every story runs in real Chromium with axe at `error`
severity, so a story is a test whether or not it has a `play` function.

```bash
npm run storybook        # the workshop, on :6006
npm run test:storybook   # every story, headless, with the accessibility gate
```

## What needs a story

**Every component in `src/components/ui/`.** A shared component without a story
is incomplete — it has no visual record, and it is outside the axe net.

`src/components/common/` components get a story when they can render without a
live query. Feature components generally do not; they are covered by component
tests and e2e.

## Structure

```
Button/
  Button.tsx
  Button.stories.tsx
```

Beside the component, not in a parallel tree — a component and its story move
together or one gets orphaned.

```tsx
const meta = { title: 'Chrome/Notifications' } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
```

Titles group by purpose: `Foundations/`, `Controls/`, `Data/`, `Chrome/`,
`Workflow/`, `Feedback/`.

One caveat: **a meta with a `component` field demands `args`**, which a
custom-`render` story does not have. Drop `component` from the meta when the
stories use `render`.

## What to cover

1. **Default** — the component as it will usually be used.
2. **Every variant**, ideally in one story so they can be compared at a glance.
3. **Every state** — loading, empty, error, disabled, read-only.
4. **The edge cases** — the longest realistic string, zero items, a hundred
   items.

The `CardStates` story in `Screenshot.stories.tsx` is the model: idle, uploading,
error and read-only, side by side in one frame.

## Interaction stories

`play` functions turn a story into a behavioural test, and they run in a real
browser — which is where the jsdom caveats stop applying.

```tsx
export const EscapeReturnsFocus: Story = {
  render: () => <Harness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const bell = canvas.getByRole('button', { name: /notifications/i });
    await userEvent.keyboard('{Escape}');
    await expect(bell).toHaveFocus();
  },
};
```

Use them for keyboard behaviour, focus management and anything that only shows
up under interaction. A story that renders into a portal — a popover, a dialog —
must query `canvasElement.ownerDocument.body`, not `canvasElement`.

## Stories as documentation

Name a story after the rule it demonstrates, and write the JSDoc above it as the
explanation — Storybook renders it in the docs tab.

```tsx
/**
 * Unread state must survive being read aloud or printed in greyscale, so it is
 * carried by a dot, a heavier title *and* visually hidden text — never by
 * colour alone, and never by dimming the read ones.
 */
export const UnreadIsNotColourAlone: Story = { … };
```

`UnreadIsNotColourAlone` tells the next developer what must stay true. `Story3`
tells them nothing.

## The accessibility gate

`.storybook/preview.tsx` sets `a11y: { test: "error" }`, so an axe violation in
any story fails `npm run test:storybook` and fails CI.

This has caught real regressions repeatedly — white text on a status fill, a
`text-muted` on a tinted surface, a second `<nav>` landmark. Fix these at the
token or structure level rather than disabling the rule for one story. If a rule
genuinely does not apply, disable it on that story with a comment saying why.

## Rules

- No live data. Props and fixtures only, so a story is deterministic.
- No `console.log` in a story — `fn()` from `storybook/test` for handler args.
- Realistic content. "Lorem ipsum" hides the layout problems that real copy
  causes.
- Keep the story current. A component change that does not update its story
  leaves a lie in the workshop.
