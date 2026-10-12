import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import type { Role, User } from '@sdp/contracts';
import { renderWithProviders } from '@tests/support/renderWithProviders.tsx';
import { HomePage } from '@/features/home/routes/HomePage.tsx';

function makeUser(roles: Role[]): User {
  return {
    id: 'u-charith',
    name: 'Charith Widanapathirana',
    email: 'charith.widanapathirana@sebsaworld.com',
    roles,
    isActive: true,
    createdAt: '2025-01-14T09:00:00.000Z',
  };
}

describe('HomePage workspace gating (spec FL 2.1-02)', () => {
  it('shows only the developer workspace for a developer', async () => {
    renderWithProviders(<HomePage user={makeUser(['Developer'])} />);

    expect(await screen.findByRole('heading', { name: 'Developer' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Reviewer' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Admin' })).not.toBeInTheDocument();
  });

  it('shows only the reviewer workspace for a reviewer', async () => {
    renderWithProviders(<HomePage user={makeUser(['Reviewer'])} />);

    expect(await screen.findByRole('heading', { name: 'Reviewer' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Developer' })).not.toBeInTheDocument();
  });

  it('shows only explicitly assigned Developer and Admin workspaces', async () => {
    renderWithProviders(<HomePage user={makeUser(['Developer', 'Admin'])} />);

    expect(await screen.findByRole('heading', { name: 'Developer' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Reviewer' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Admin' })).toBeInTheDocument();
  });

  it('shows the existing Admin portal for a Super Admin', async () => {
    renderWithProviders(<HomePage user={makeUser(['SuperAdmin'])} />);

    expect(await screen.findByRole('heading', { name: 'Admin' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Developer' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Reviewer' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Super Admin' })).not.toBeInTheDocument();
  });

  it('tells a user with no roles to contact an administrator', async () => {
    renderWithProviders(<HomePage user={makeUser([])} />);

    expect(
      await screen.findByText(/No workspaces are assigned to your account/i),
    ).toBeInTheDocument();
  });
});

describe('HomePage data seam', () => {
  it('greets the signed-in user by name', async () => {
    renderWithProviders(<HomePage user={makeUser(['Developer'])} />);
    expect(await screen.findByText('Charith Widanapathirana')).toBeInTheDocument();
  });
});
