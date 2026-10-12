import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import type { User } from '@sdp/contracts';
import { renderWithProviders } from '@tests/support/renderWithProviders.tsx';
import { UserChip } from '@/features/auth/components/UserChip.tsx';

const adminDeveloper: User = {
  id: 'admin-developer',
  name: 'Initial Administrator',
  email: 'charith.widanapathirana@sebsaworld.com',
  roles: ['Developer', 'Admin'],
  isActive: true,
  createdAt: '2026-09-15T00:00:00.000Z',
};

describe('UserChip assigned roles', () => {
  it('shows only roles returned for the signed-in user', () => {
    renderWithProviders(<UserChip user={adminDeveloper} />);

    expect(screen.getByText(/Developer.*Admin/)).toBeInTheDocument();
    expect(screen.queryByText(/Reviewer/)).not.toBeInTheDocument();
  });
});
