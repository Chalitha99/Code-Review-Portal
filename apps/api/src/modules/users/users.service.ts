import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiException } from '../../common/api-error.js';
import { reasonMetadata } from '../../common/dto/reason.dto.js';
import { rethrowPrismaConflict } from '../../common/prisma-errors.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import type { RoleCode } from '../auth/auth.constants.js';
import { assertCanGrantRoles, assertCanManageUser } from '../user-roles/role-policy.js';
import {
  assertNotLastActiveRoleHolder,
  lockPrivilegedRoleInvariants,
} from '../user-roles/role-invariants.js';
import { PasswordLinksService, type IssuedLink } from '../password-links/password-links.service.js';
import { ReviewerWorkloadService } from '../reviewer-workload/reviewer-workload.service.js';
import type { CreateUserDto } from './dto/create-user.dto.js';
import type { UpdateUserDto } from './dto/update-user.dto.js';
import { assignedRoleCodes, toUserResponse } from './user-response.js';
import { AuditService } from '../audit/audit.service.js';
import { AccountNotices } from '../../integrations/mail/account-notices.service.js';

const userInclude = {
  userRoles: { where: { role: { deletedAt: null } }, include: { role: true } },
} satisfies Prisma.UserInclude;

type UserWithRoles = Prisma.UserGetPayload<{ include: typeof userInclude }>;

/** `j***@example.com`: enough to recognise, not enough to harvest. */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 1)}***@${domain}`;
}

function snapshot(user: UserWithRoles) {
  return {
    name: user.fullName,
    email: user.email,
    roles: assignedRoleCodes(user),
    isActive: user.status === 'ACTIVE',
    status: user.status,
  };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly passwordLinks: PasswordLinksService,
    private readonly workload: ReviewerWorkloadService,
    private readonly notices?: AccountNotices,
  ) {}

  async findAll() {
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null },
      include: userInclude,
      orderBy: { fullName: 'asc' },
    });
    const invites = await this.passwordLinks.inviteStates(
      users.filter((user) => user.status === 'INVITED').map((user) => user.id),
    );
    return users.map((user) => toUserResponse(user, invites.get(user.id)));
  }

  async findOne(id: string) {
    return this.respond(await this.getUser(id));
  }

  private async getUser(id: string): Promise<UserWithRoles> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: userInclude,
    });
    if (!user) throw new NotFoundException(`User ${id} was not found`);
    return user;
  }

  /** The user as the Users tab reads it, with their live invite if still INVITED. */
  private async respond(user: UserWithRoles) {
    const invites =
      user.status === 'INVITED' ? await this.passwordLinks.inviteStates([user.id]) : undefined;
    return toUserResponse(user, invites?.get(user.id));
  }

  /**
   * Creates the account INVITED — no password is ever chosen by an admin — and
   * emails a one-time set-password link. The link is created in the same
   * transaction as the user; the email goes out only after that commits.
   */
  async create(dto: CreateUserDto, actor: AuthenticatedUser) {
    assertCanGrantRoles(actor, [], dto.roles);
    const roles = await this.findRoles(dto.roles);
    const email = dto.email.trim().toLowerCase();

    // Case-insensitive, matching the web client: two spellings of one address
    // must never become two accounts.
    const clash = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (clash) {
      throw new ApiException('EMAIL_TAKEN', 'A user with that email address already exists.');
    }

    let created: UserWithRoles;
    let link: IssuedLink;
    try {
      ({ created, link } = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email,
            fullName: dto.name.trim(),
            status: 'INVITED',
            userRoles: {
              create: roles.map(
                (role) =>
                  ({
                    grantor: { connect: { id: actor.id } },
                    role: { connect: { id: role.id } },
                  }) satisfies Prisma.UserRoleCreateWithoutUserInput,
              ),
            },
          },
          include: userInclude,
        });
        await this.audit.record(tx, actor, {
          actionType: 'USER_CREATED',
          entityType: 'USER',
          entityId: user.id,
          targetUserId: user.id,
          description: `${actor.name} invited user ${user.fullName}`,
          newValue: snapshot(user),
          metadata: { targetLabel: user.fullName, ...reasonMetadata(dto.reason) },
        });
        for (const [index, role] of roles.entries()) {
          await this.audit.record(tx, actor, {
            actionType: 'ROLE_GRANTED',
            entityType: 'ROLE',
            entityId: String(role.id),
            targetUserId: user.id,
            description: `${actor.name} granted ${role.code} role to ${user.fullName}`,
            oldValue: roles.slice(0, index).map((assignedRole) => assignedRole.code),
            newValue: roles.slice(0, index + 1).map((assignedRole) => assignedRole.code),
            metadata: { targetLabel: user.fullName, ...reasonMetadata(dto.reason) },
          });
        }
        return { created: user, link: await this.passwordLinks.createLink(tx, user.id, 'INVITE') };
      }));
    } catch (error) {
      rethrowPrismaConflict(error);
    }

    const emailStatus = await this.passwordLinks.deliver(link, created, 'INVITE');
    return toUserResponse(created, { expiresAt: link.expiresAt, emailStatus });
  }

  async update(id: string, dto: UpdateUserDto, actor: AuthenticatedUser) {
    const existing = await this.getUser(id);
    const existingRoles = assignedRoleCodes(existing);
    assertCanManageUser(actor, existingRoles);

    // Activation needs a password, which only the user can set: resend or
    // revoke the invite instead.
    if (existing.status === 'INVITED' && dto.isActive !== undefined) {
      throw new ApiException(
        'INVITE_PENDING',
        'This user has not set a password yet. Resend or revoke the invite instead.',
      );
    }
    if (dto.isActive === false && actor.id === id) {
      throw new ApiException('SELF_LOCKOUT', 'You cannot deactivate your own account.');
    }
    const deactivating = dto.isActive === false && existing.status === 'ACTIVE';
    if (deactivating && existingRoles.includes('REVIEWER')) {
      await this.workload.assertCanRemoveReviewer(existing, actor, 'DEACTIVATE', dto.reason);
    }

    const newEmail = dto.email?.trim().toLowerCase();
    const emailChanging = newEmail !== undefined && newEmail !== existing.email.toLowerCase();
    if (emailChanging && actor.id === id) {
      throw new ApiException(
        'SELF_LOCKOUT',
        'You cannot change your own sign-in email here; it would sign you out of every session.',
      );
    }
    if (emailChanging && dto.isActive === false) {
      throw new ApiException(
        'RULE_VIOLATION',
        'Change the email and the account status in separate steps.',
      );
    }

    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase();
      const clash = await this.prisma.user.findFirst({
        where: { id: { not: id }, email: { equals: email, mode: 'insensitive' } },
        select: { id: true },
      });
      if (clash) {
        throw new ApiException('EMAIL_TAKEN', 'A user with that email address already exists.');
      }
    }

    const data = {
      ...(dto.email === undefined ? {} : { email: dto.email.trim().toLowerCase() }),
      ...(dto.name === undefined ? {} : { fullName: dto.name.trim() }),
      ...(dto.isActive === undefined
        ? {}
        : { status: dto.isActive ? ('ACTIVE' as const) : ('INACTIVE' as const) }),
      // A new address must be proven before it can sign in or receive resets:
      // the account goes back to INVITED with no password, and an invite goes
      // to the new address (set-password then re-activates it).
      ...(emailChanging ? { status: 'INVITED' as const, passwordHash: null } : {}),
    } satisfies Prisma.UserUpdateInput;

    let invite: IssuedLink | undefined;
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        if (dto.isActive === false) {
          await lockPrivilegedRoleInvariants(tx);
          await assertNotLastActiveRoleHolder(
            tx,
            existing,
            existingRoles,
            'deactivated or deleted',
          );
          if (deactivating && existingRoles.includes('REVIEWER')) {
            await this.workload.assertNoPendingWork(tx, existing);
          }
          // A deactivated account must not be revived by a link sent earlier.
          await this.passwordLinks.revokeAllFor(tx, id);
        }
        if (emailChanging) {
          await lockPrivilegedRoleInvariants(tx);
          if (existing.status === 'ACTIVE') {
            await assertNotLastActiveRoleHolder(
              tx,
              existing,
              existingRoles,
              'deactivated or deleted',
            );
          }
          // Every session and every outstanding link belonged to the old address.
          await tx.refreshSession.updateMany({
            where: { userId: id, revokedAt: null },
            data: { revokedAt: new Date() },
          });
          await this.passwordLinks.revokeAllFor(tx, id);
        }
        const updated = await tx.user.update({ where: { id }, data, include: userInclude });
        if (emailChanging) {
          invite = await this.passwordLinks.createLink(tx, id, 'INVITE');
          await this.audit.record(tx, actor, {
            actionType: 'USER_EMAIL_CHANGED',
            entityType: 'USER',
            entityId: id,
            targetUserId: id,
            description: `${actor.name} changed the sign-in email of ${existing.fullName}; a new invite was issued`,
            // Masked: the audit trail records that it changed, not the addresses.
            oldValue: { email: maskEmail(existing.email) },
            newValue: { email: maskEmail(updated.email), status: 'INVITED' },
            metadata: { targetLabel: existing.fullName, ...reasonMetadata(dto.reason) },
          });
        }
        const actionType =
          dto.isActive === undefined
            ? 'USER_UPDATED'
            : dto.isActive
              ? 'USER_ACTIVATED'
              : 'USER_DEACTIVATED';
        await this.audit.record(tx, actor, {
          actionType,
          entityType: 'USER',
          entityId: id,
          targetUserId: id,
          description: `${actor.name} ${actionType.toLowerCase().replaceAll('_', ' ')} ${existing.fullName}`,
          oldValue: snapshot(existing),
          newValue: snapshot(updated),
          metadata: { targetLabel: existing.fullName, ...reasonMetadata(dto.reason) },
        });
        return updated;
      });
      if (emailChanging && existing.status === 'ACTIVE') {
        this.notices?.emailChanged(existing, user.email, actor.name);
      }
      if (dto.isActive !== undefined && (existing.status === 'ACTIVE') !== dto.isActive) {
        this.notices?.accessChanged(
          user,
          actor.name,
          dto.isActive ? 'Your account was reactivated' : 'Your account was deactivated',
          dto.reason,
        );
      }
      if (invite !== undefined) {
        const emailStatus = await this.passwordLinks.deliver(invite, user, 'INVITE');
        return toUserResponse(user, { expiresAt: invite.expiresAt, emailStatus });
      }
      return await this.respond(user);
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }

  /** Soft delete: the record stays for task history, Reports and the audit trail. */
  async remove(id: string, actor: AuthenticatedUser, reason?: string): Promise<void> {
    const existing = await this.getUser(id);
    const existingRoles = assignedRoleCodes(existing);
    assertCanManageUser(actor, existingRoles);
    if (actor.id === id) {
      throw new ApiException('SELF_LOCKOUT', 'You cannot delete your own account.');
    }
    if (existingRoles.includes('REVIEWER')) {
      await this.workload.assertCanRemoveReviewer(existing, actor, 'DELETE', reason);
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await lockPrivilegedRoleInvariants(tx);
        await assertNotLastActiveRoleHolder(tx, existing, existingRoles, 'deactivated or deleted');
        if (existingRoles.includes('REVIEWER'))
          await this.workload.assertNoPendingWork(tx, existing);
        await this.passwordLinks.revokeAllFor(tx, id);
        await tx.refreshSession.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await tx.user.update({
          where: { id },
          data: { status: 'INACTIVE', deletedAt: new Date() },
        });
        await this.audit.record(tx, actor, {
          actionType: 'USER_DELETED',
          entityType: 'USER',
          entityId: id,
          targetUserId: id,
          description: `${actor.name} deleted user ${existing.fullName}`,
          oldValue: snapshot(existing),
          newValue: { isActive: false, deleted: true },
          metadata: { targetLabel: existing.fullName, ...reasonMetadata(reason) },
        });
      });
      if (existing.status === 'ACTIVE') {
        this.notices?.accessChanged(existing, actor.name, 'Your account was removed', reason);
      }
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }

  private async findRoles(roleCodes: readonly RoleCode[]) {
    const roles = await this.prisma.role.findMany({
      where: { code: { in: [...roleCodes] }, deletedAt: null },
    });
    if (roles.length !== roleCodes.length) {
      throw new NotFoundException('One or more roles were not found');
    }
    return roles;
  }
}
