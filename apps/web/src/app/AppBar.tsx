import { Home } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { User } from '@sdp/contracts';
import { cn, SebsaLogo } from '@/components/ui';
import { PAGE_CONTAINER } from '@/components/common/PageContainer.tsx';
import { ROUTES } from '@/config/routes.ts';
import common from '@/content/common.json';
import { UserChip } from '@/features/auth/components/UserChip.tsx';
import { NotificationBell } from '@/features/notifications/components/NotificationBell.tsx';

/**
 * The application header.
 *
 * Two variants appear in the wireframes: the portal home shows only the logo,
 * while inner pages add a home button and the page title. Rather than two
 * components, `title` being present is what switches the variant — the parts
 * that differ are exactly the parts that are optional.
 *
 * Lives in `app/` because it composes two features (auth, notifications), and
 * only the app layer is permitted to reach across features.
 */
export function AppBar({
  user,
  title,
  showNotifications = true,
}: {
  user: User;
  title?: string;
  /** Suppressed for accounts with no roles, which cannot act on anything. */
  showNotifications?: boolean;
}) {
  const showHomeLink = title !== undefined;

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface">
      {/*
        The header bar spans the viewport, but its CONTENT is constrained to the
        same container as the page below — otherwise the logo sits at the screen
        edge while the page title beneath it starts 100px in, and the two never
        line up on a wide monitor.
      */}
      {/*
        `gap-3 sm:gap-4`: at 320px the row is logo + bell + account chip and
        every one of them is `shrink-0`, so nothing can absorb a shortfall — the
        row was overflowing the viewport by a hair and scrolling the whole page
        sideways. The gap is the only slack available, and one step narrower on
        phones is enough.
      */}
      <div className={cn(PAGE_CONTAINER, 'flex items-center gap-3 py-3 sm:gap-4')}>
        {/*
          Home link and page title are hidden below `sm`.

          At 320px the logo and the account controls alone consume the row, and
          both of these are redundant there: the logo already links home, and the
          page announces its own title in the content below. Keeping them made
          the whole page scroll horizontally — caught by a real browser, since
          jsdom computes no layout.
        */}
        {showHomeLink ? (
          <Link
            to={ROUTES.home}
            className="hidden size-9 shrink-0 place-items-center rounded-lg transition-colors hover:bg-canvas sm:grid"
            aria-label={common.actions.goHome}
          >
            <Home className="size-5 text-ink-700" aria-hidden="true" />
          </Link>
        ) : null}

        <Link to={ROUTES.home} className="shrink-0 rounded-md" aria-label={common.app.name}>
          {/* Title suppressed: the link already names the destination, so a
              nested <title> would make screen readers announce it twice. */}
          <SebsaLogo height={34} title="" />
        </Link>

        {title === undefined ? null : (
          <>
            <span className="hidden h-8 w-px shrink-0 bg-line sm:block" aria-hidden="true" />
            {/*
              `min-w-0` is load-bearing. A flex child's default `min-width:auto`
              is its content width, so `truncate` alone cannot shrink it and the
              row grows past the viewport instead.
            */}
            {/*
              A `<p>`, not an `<h1>`. Every workspace page renders its own `<h1>`
              in `PageHeader`, so marking this one up as a heading gave the
              document two level-one headings that say the same thing — the
              second of which is the real one.
            */}
            <p className="hidden min-w-0 truncate text-lg font-semibold sm:block">{title}</p>
          </>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          {showNotifications ? (
            <>
              <NotificationBell />
              <span className="hidden h-8 w-px bg-line sm:block" aria-hidden="true" />
            </>
          ) : null}
          <UserChip user={user} />
        </div>
      </div>
    </header>
  );
}
