import * as Popover from '@radix-ui/react-popover';
import { ChevronDown, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import type { Role, User } from '@sdp/contracts';
import { cn } from '@/components/ui';
import { Avatar } from '@/components/common/Avatar.tsx';
import { interpolate } from '@/lib/formatters.ts';
import auth from '@/content/auth.json';
import common from '@/content/common.json';
import login from '@/content/login.json';
import { useLogout } from '../api/queries.ts';

function roleLine(roles: readonly Role[]): string {
  if (roles.length === 0) return auth.profile.noRoles;
  return roles.map((r) => common.role[r]).join(auth.profile.roleSeparator);
}

/**
 * Header profile chip and account menu.
 *
 * The CHIP carries the identity — avatar, name, roles. The MENU carries only
 * sign-out.
 *
 * It used to repeat name, email and roles inside the menu, directly under a chip
 * already showing the same thing, which is what the business reported: opening
 * the menu showed you your own name twice and buried the one action in it. The
 * email went with it — it appeared nowhere else in the UI, and an address the
 * user already typed to sign in is not worth a panel.
 *
 * A consequence worth knowing: below `sm` the chip hides its name and roles, so
 * the avatar and the trigger's `aria-label` are now the only places a signed-in
 * identity is stated on a phone. That is a deliberate trade, not an oversight.
 *
 * An earlier version also listed every seeded user so a tester could switch
 * identity from here. That was removed for a different reason: an account menu
 * that enumerates the whole staff directory reads as a data leak rather than a
 * developer convenience, and it has no counterpart in the real product. Testing
 * another role means signing out and signing in as that user, which is what an
 * actual user does and is only practical because credential sign-in works.
 */
export function UserChip({ user }: { user: User }) {
  const logout = useLogout();

  return (
    <Popover.Root>
      <Popover.Trigger
        className={cn(
          'flex items-center gap-2.5 rounded-full border border-line bg-surface py-1 pr-3 pl-1 transition-colors hover:border-line-strong',
        )}
        // Names the user first, then the control, so a screen-reader user hears
        // who is signed in rather than only what the button does.
        aria-label={interpolate(auth.profile.menuLabel, { name: user.name })}
      >
        <Avatar name={user.name} />
        <span className="hidden text-left sm:block">
          <span className="block text-sm font-semibold text-ink-900">{user.name}</span>
          <span className="block text-[0.7rem] text-ink-500">{roleLine(user.roles)}</span>
        </span>
        <ChevronDown className="size-4 text-ink-400" aria-hidden="true" />
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          /*
            Sized to its one item. The menu used to be `w-72` to fit a repeat of
            the identity block, and keeping that width around a single Sign out
            row left most of the panel empty.
          */
          className="z-50 w-48 rounded-card border border-line bg-surface p-2 shadow-popover"
        >
          <button
            type="button"
            onClick={() => {
              logout.mutate(undefined, {
                onSettled: () => toast.success(login.messages.signedOut),
              });
            }}
            disabled={logout.isPending}
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm font-medium text-ink-700 transition-colors hover:bg-canvas disabled:opacity-50"
          >
            <LogOut className="size-4 shrink-0 text-ink-400" aria-hidden="true" />
            {common.actions.signOut}
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
