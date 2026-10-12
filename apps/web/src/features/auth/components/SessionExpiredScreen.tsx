import { ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { SebsaLogo } from '@/components/ui';
import { Button } from '@/components/ui/Button.tsx';
import { ROUTES } from '@/config/routes.ts';
import { useSession } from '@/hooks/useSession.ts';
import auth from '@/content/auth.json';
import common from '@/content/common.json';
import { Hourglass } from '@/components/common/Hourglass.tsx';

/**
 * What the user sees the moment their session times out.
 *
 * WHY THIS EXISTS
 * The app used to crash here — `RootLayout` wrote to the session store from its
 * render body on a 401, which put React into a render loop and surfaced as the
 * route boundary's "This page ran into a problem". Fixing the loop alone would
 * have left a silent bounce to `/login`, which is only marginally better: the
 * user loses their place and is never told why.
 *
 * So the timeout gets a screen of its own. It names what happened, gives the rule
 * that caused it, promises the deep link back, and offers exactly one thing to do.
 *
 * NO HEADER, NO NAVIGATION. Every request behind this screen would 401, so a nav
 * bar would be offering doors that do not open — a worse lie than the crash was.
 * The logo alone, for orientation.
 *
 * THE PURGE HAS ALREADY HAPPENED. `expireSession()` clears storage, the query
 * cache and the wizard draft before this renders, so the button is genuinely just
 * "take me to sign in" and there is nothing sensitive sitting behind it while the
 * user reads.
 *
 * Amber, not red: being timed out is not an error the user caused.
 */
export function SessionExpiredScreen() {
  const navigate = useNavigate();
  const dismissExpiry = useSession((state) => state.dismissExpiry);

  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-4 py-10">
      {/*
        `role="status"` rather than `alert`: this is the state of the page the user
        is now looking at, not an interruption of something else. `aria-live` is
        deliberately absent — the screen replaces the whole view, so a screen
        reader reaches it in reading order without being talked over.
      */}
      <div
        role="status"
        className="w-full max-w-lg rounded-card bg-surface p-8 text-center shadow-card-raised sm:p-10"
      >
        <div className="flex justify-center">
          <SebsaLogo height={30} />
        </div>

        <div className="mt-8 flex justify-center">
          <Hourglass size="lg" />
        </div>

        <p className="mt-8 text-xs font-semibold tracking-[0.18em] text-warning uppercase">
          {auth.expired.badge}
        </p>
        <h1 className="mt-2 font-display text-2xl font-bold text-ink-900">{auth.expired.title}</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink-500">
          {auth.expired.description}
        </p>

        {/*
          Spelling out what was cleared, rather than leaving the user to wonder
          whether their half-finished work is still on this machine. It is not,
          and being told so is the difference between a tidy sign-out and a
          suspicion that something was lost.
        */}
        <p className="mx-auto mt-4 max-w-md text-xs text-ink-400">{auth.expired.cleared}</p>

        <Button
          className="mt-8"
          size="lg"
          variant="brand"
          onClick={() => {
            // Clears the blocking flag but leaves `didExpire`, so the login form
            // still shows its reminder when the user lands there.
            dismissExpiry();
            void navigate(ROUTES.login, { replace: true });
          }}
          trailingIcon={<ArrowRight className="size-4" aria-hidden="true" />}
        >
          {auth.expired.action}
        </Button>

        <p className="mt-6 text-xs text-ink-400">
          {common.app.poweredBy}{' '}
          <span className="font-semibold text-ink-500">{common.app.organisation}</span>
        </p>
      </div>
    </div>
  );
}
