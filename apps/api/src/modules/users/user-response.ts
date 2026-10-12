import { ROLE_CODES, ROLE_LABELS, isRoleCode, type RoleCode } from '../auth/auth.constants.js';

export interface UserWithRoleRecords {
  id: string;
  email: string;
  fullName: string;
  status: 'ACTIVE' | 'INACTIVE' | 'INVITED';
  createdAt: Date;
  userRoles: readonly { role: { code: string } }[];
}

/** The live invite shown on the Users tab, when the account is still INVITED. */
export interface InviteSummary {
  expiresAt: Date;
  emailStatus: 'SENT' | 'FAILED' | null;
}

export function assignedRoleCodes(user: Pick<UserWithRoleRecords, 'userRoles'>): RoleCode[] {
  const assigned = new Set(user.userRoles.map(({ role }) => role.code));
  for (const code of assigned) {
    if (!isRoleCode(code)) {
      throw new Error(`Unsupported role code in database: ${code}`);
    }
  }
  return ROLE_CODES.filter((code) => assigned.has(code));
}

const PUBLIC_STATUS = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'DEACTIVATED',
  INVITED: 'INVITED',
} as const;

/**
 * The `userSchema` shape (packages/contracts identity.ts). `status` and the
 * invite fields drive the Users tab's Invited pill and Resend/Revoke actions.
 */
export function toUserResponse(user: UserWithRoleRecords, invite?: InviteSummary | null) {
  const isInvited = user.status === 'INVITED';
  return {
    id: user.id,
    name: user.fullName,
    email: user.email,
    roles: assignedRoleCodes(user).map((code) => ROLE_LABELS[code]),
    isActive: user.status === 'ACTIVE',
    createdAt: user.createdAt.toISOString(),
    status: PUBLIC_STATUS[user.status],
    inviteExpiresAt: isInvited && invite ? invite.expiresAt.toISOString() : null,
    inviteEmailStatus: isInvited && invite ? invite.emailStatus : null,
  };
}
