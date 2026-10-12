import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { User } from '@sdp/contracts';
import { StatusPill } from '@/features/local-auth/admin/InviteCells.tsx';

const inHours = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

const base: User = {
  id: 'u-1',
  name: 'Test Person',
  email: 'test@sebsaworld.com',
  roles: ['Developer'],
  isActive: true,
  createdAt: '2026-10-01T09:00:00.000Z',
};

describe('StatusPill', () => {
  it('says Invited for a user whose invite email was sent', () => {
    render(
      <StatusPill
        user={{ ...base, isActive: false, status: 'INVITED', inviteExpiresAt: inHours(23.5) }}
      />,
    );
    expect(screen.getByText('Invited')).toHaveAttribute('title', 'Expires in 23 h');
  });

  it.each([
    ['expired', { inviteExpiresAt: inHours(-1) }, 'Expired'],
    [
      'the email failed',
      { inviteExpiresAt: inHours(5), inviteEmailStatus: 'FAILED' as const },
      'Email failed',
    ],
  ])('still says Invited, and explains in the tooltip when %s', (_label, extra, tooltip) => {
    render(<StatusPill user={{ ...base, isActive: false, status: 'INVITED', ...extra }} />);
    expect(screen.getByText('Invited')).toHaveAttribute('title', tooltip);
  });

  it('has no tooltip for Active and Deactivated users', () => {
    const { rerender } = render(<StatusPill user={{ ...base, status: 'ACTIVE' }} />);
    expect(screen.getByText('Active')).not.toHaveAttribute('title');

    rerender(<StatusPill user={{ ...base, isActive: false, status: 'DEACTIVATED' }} />);
    expect(screen.getByText('Deactivated')).not.toHaveAttribute('title');
  });

  it('falls back to isActive for a row with no status', () => {
    render(<StatusPill user={{ ...base, isActive: false }} />);
    expect(screen.getByText('Deactivated')).toBeInTheDocument();
  });
});
