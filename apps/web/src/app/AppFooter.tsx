import common from '@/content/common.json';

/**
 * The application footer.
 *
 * Rendered once, by `RootLayout`, so it is a `contentinfo` landmark on every
 * authenticated page rather than markup one screen happened to end with. It
 * used to be six lines inlined at the bottom of `HomePage`, inside `<main>` —
 * which meant it was not a landmark at all, and every other screen had none.
 *
 * `/login` renders its own "Powered by" line inside the brand panel instead of
 * this component: that screen sits outside `RootLayout` (`app/routes.tsx`) and
 * the line there is deliberately not a landmark — see the comment in
 * `LoginPage.tsx` on why it exists to balance the panel's composition.
 *
 * Lives in `app/` beside `AppBar`, the other piece of shell chrome `RootLayout`
 * composes once for the whole authenticated tree.
 */
export function AppFooter() {
  return (
    <footer className="border-t border-line bg-surface px-6 py-6 text-center">
      <p className="text-sm text-ink-500">
        {common.app.poweredBy}{' '}
        <span className="font-bold text-ink-900">{common.app.organisation}</span>
      </p>
    </footer>
  );
}
