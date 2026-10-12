import { useEffect, useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '@/lib/queryClient';
import { useSessionReset } from './useSessionReset';
import { useCurrentUser } from '@/hooks/useCurrentUser.ts';
import { useSession } from '@/hooks/useSession.ts';

function AuthBootstrap() {
  const currentUser = useCurrentUser();
  const authenticationChecked = useSession((state) => state.authenticationChecked);
  const signOut = useSession((state) => state.signOut);
  const isExpired = useSession((state) => state.isExpired);

  useEffect(() => {
    if (currentUser.data) authenticationChecked(currentUser.data.id);
  }, [authenticationChecked, currentUser.data]);

  useEffect(() => {
    if (currentUser.isError && !isExpired) signOut();
  }, [currentUser.isError, isExpired, signOut]);
  return null;
}

function SessionReset({ children }: { children: ReactNode }) {
  useSessionReset();
  return <>{children}</>;
}

export const AppProviders = ({ children }: { children: ReactNode }) => {
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthBootstrap />
      <SessionReset>{children}</SessionReset>
    </QueryClientProvider>
  );
};
