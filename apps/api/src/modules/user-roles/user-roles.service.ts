import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiException } from '../../common/api-error.js';
import { rethrowPrismaConflict } from '../../common/prisma-errors.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { isRoleCode, type RoleCode } from '../auth/auth.constants.js';
import type { CreateUserRoleDto } from './dto/create-user-role.dto.js';
import type { UpdateUserRoleDto } from './dto/update-user-role.dto.js';
import type { UserRoleQueryDto } from './dto/user-role-query.dto.js';
import { assertCanGrantRoles, assertCanManageUser } from './role-policy.js';
import { assertNotLastActiveRoleHolder, lockPrivilegedRoleInvariants } from './role-invariants.js';
import { assignedRoleCodes, toUserResponse } from '../users/user-response.js';
import { AuditService } from '../audit/audit.service.js';
import { ReviewerWorkloadService } from '../reviewer-workload/reviewer-workload.service.js';
import { reasonMetadata } from '../../common/dto/reason.dto.js';
import { AccountNotices, roleList } from '../../integrations/mail/account-notices.service.js';

const safeUserSelect = {
  id: true,
  email: true,
  fullName: true,
  status: true,
  createdAt: true,
} as const;
const userRoleInclude = {
  user: { select: safeUserSelect },
  role: true,
  grantor: { select: safeUserSelect },
} as const;
const userInclude = {
  userRoles: { where: { role: { deletedAt: null } }, include: { role: true } },
} satisfies Prisma.UserInclude;
type UserWithRoles = Prisma.UserGetPayload<{ include: typeof userInclude }>;

@Injectable()
export class UserRolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly workload: ReviewerWorkloadService,
    private readonly notices?: AccountNotices,
  ) {}

  private notifyRoles(
    user: { email: string; fullName: string; status: string },
    actorName: string,
    roles: readonly string[],
    reason?: string,
  ) {
    if (user.status !== 'ACTIVE') return;
    this.notices?.accessChanged(user, actorName, `Your roles are now: ${roleList(roles)}`, reason);
  }

  findAll(query: UserRoleQueryDto = {}) {
    return this.prisma.userRole.findMany({
      where: {
        ...(query.userId === undefined ? {} : { userId: query.userId }),
        ...(query.roleId === undefined ? {} : { roleId: query.roleId }),
        user: { deletedAt: null },
        role: { deletedAt: null },
      },
      include: userRoleInclude,
      orderBy: { grantedAt: 'desc' },
    });
  }

  async findOne(userId: string, roleId: number) {
    const userRole = await this.prisma.userRole.findFirst({
      where: { userId, roleId, user: { deletedAt: null }, role: { deletedAt: null } },
      include: userRoleInclude,
    });
    if (!userRole) {
      throw new NotFoundException(`Role ${roleId} is not assigned to user ${userId}`);
    }
    return userRole;
  }

  async create(dto: CreateUserRoleDto, actor: AuthenticatedUser) {
    const [user, role] = await Promise.all([this.getUser(dto.userId), this.getRole(dto.roleId)]);
    const roleCode = this.availableRoleCode(role.code);
    assertCanGrantRoles(actor, assignedRoleCodes(user), [roleCode]);

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const assignment = await tx.userRole.create({
          data: { userId: dto.userId, roleId: dto.roleId, grantedBy: actor.id },
          include: userRoleInclude,
        });
        await this.audit.record(tx, actor, {
          actionType: 'ROLE_GRANTED',
          entityType: 'ROLE',
          entityId: String(role.id),
          targetUserId: user.id,
          description: `${actor.name} granted ${role.name} role to ${user.fullName}`,
          oldValue: currentRoleValue(user),
          newValue: [...assignedRoleCodes(user), roleCode],
        });
        return assignment;
      });
      this.notifyRoles(user, actor.name, [...assignedRoleCodes(user), roleCode]);
      return created;
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }

  async update(userId: string, roleId: number, dto: UpdateUserRoleDto, actor: AuthenticatedUser) {
    const user = await this.getUser(userId);
    assertCanManageUser(actor, assignedRoleCodes(user));
    await this.findOne(userId, roleId);

    try {
      return await this.prisma.userRole.update({
        where: { userId_roleId: { userId, roleId } },
        data: { grantedBy: dto.grantedBy ?? actor.id },
        include: userRoleInclude,
      });
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }

  async remove(userId: string, roleId: number, actor: AuthenticatedUser): Promise<void> {
    const user = await this.getUser(userId);
    const role = await this.getRole(roleId);
    const roleCode = this.availableRoleCode(role.code);
    const currentRoles = assignedRoleCodes(user);
    if (currentRoles.length <= 1) {
      throw new ApiException('RULE_VIOLATION', 'A user must retain at least one role');
    }
    assertCanGrantRoles(
      actor,
      currentRoles,
      currentRoles.filter((code) => code !== roleCode),
    );
    if (roleCode === 'REVIEWER') {
      await this.workload.assertCanRemoveReviewer(user, actor, 'REMOVE_REVIEWER_ROLE');
    }

    await this.prisma.$transaction(async (tx) => {
      await lockPrivilegedRoleInvariants(tx);
      if (roleCode === 'REVIEWER') await this.workload.assertNoPendingWork(tx, user);
      const assignment = await tx.userRole.findUnique({
        where: { userId_roleId: { userId, roleId } },
      });
      if (!assignment) {
        throw new NotFoundException(`Role ${roleId} is not assigned to user ${userId}`);
      }
      await assertNotLastActiveRoleHolder(tx, user, [roleCode], 'demoted');
      await tx.userRole.delete({ where: { userId_roleId: { userId, roleId } } });
      await this.audit.record(tx, actor, {
        actionType: 'ROLE_REMOVED',
        entityType: 'ROLE',
        entityId: String(role.id),
        targetUserId: user.id,
        description: `${actor.name} removed ${role.name} role from ${user.fullName}`,
        oldValue: currentRoles,
        newValue: currentRoles.filter((code) => code !== roleCode),
      });
    });
    this.notifyRoles(
      user,
      actor.name,
      currentRoles.filter((code) => code !== roleCode),
    );
  }

  async findForUser(userId: string) {
    await this.getUser(userId);
    return this.findAll({ userId });
  }

  /**
   * Replaces the whole role set in one step: roles in `roleCodes` but not held
   * are granted, held roles left out are revoked. Adding a role and removing
   * one from a multi-role user are both this call.
   */
  async replaceForUser(
    userId: string,
    roleCodes: RoleCode[],
    actor: AuthenticatedUser,
    reason?: string,
  ) {
    const user = await this.getUser(userId);
    const currentRoles = assignedRoleCodes(user);
    assertCanGrantRoles(actor, currentRoles, roleCodes);
    if (currentRoles.includes('REVIEWER') && !roleCodes.includes('REVIEWER')) {
      await this.workload.assertCanRemoveReviewer(user, actor, 'REMOVE_REVIEWER_ROLE', reason);
    }

    const roles = await this.prisma.role.findMany({
      where: { code: { in: roleCodes }, deletedAt: null },
    });
    if (roles.length !== roleCodes.length) {
      throw new NotFoundException('One or more roles were not found');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await lockPrivilegedRoleInvariants(tx);
      await assertNotLastActiveRoleHolder(
        tx,
        user,
        currentRoles.filter((role) => !roleCodes.includes(role)),
        'demoted',
      );
      if (currentRoles.includes('REVIEWER') && !roleCodes.includes('REVIEWER')) {
        await this.workload.assertNoPendingWork(tx, user);
      }

      await tx.userRole.deleteMany({ where: { userId } });
      await tx.userRole.createMany({
        data: roles.map((role) => ({ userId, roleId: role.id, grantedBy: actor.id })),
      });
      const result = await tx.user.findUniqueOrThrow({
        where: { id: userId, deletedAt: null },
        include: userInclude,
      });
      await this.audit.record(tx, actor, {
        actionType: 'ROLES_CHANGED',
        entityType: 'USER',
        entityId: userId,
        targetUserId: userId,
        description: `${actor.name} changed roles for ${user.fullName}`,
        oldValue: currentRoles,
        newValue: roleCodes,
        metadata: { targetLabel: user.fullName, ...reasonMetadata(reason) },
      });
      return result;
    });

    const changed =
      currentRoles.length !== roleCodes.length ||
      currentRoles.some((code) => !roleCodes.includes(code));
    if (changed) this.notifyRoles(user, actor.name, roleCodes, reason);
    return toUserResponse(updated);
  }

  async transferSuperAdmin(targetUserId: string, actor: AuthenticatedUser) {
    if (targetUserId === actor.id) {
      throw new ApiException(
        'RULE_VIOLATION',
        'Super Admin ownership must be transferred to another user',
      );
    }
    // Super Admin is exclusive, so the new holder loses Reviewer. Their open
    // review work must be handed over first, exactly as for removing the role.
    const candidate = await this.prisma.user.findFirst({
      where: { id: targetUserId, deletedAt: null },
      include: userInclude,
    });
    if (candidate && assignedRoleCodes(candidate).includes('REVIEWER')) {
      await this.workload.assertCanRemoveReviewer(candidate, actor, 'TRANSFER_SUPER_ADMIN');
    }

    try {
      const transferred = await this.prisma.$transaction(async (tx) => {
        await lockPrivilegedRoleInvariants(tx);

        const roles = await tx.role.findMany({
          where: { code: { in: ['ADMIN', 'SUPER_ADMIN'] }, deletedAt: null },
        });
        const adminRole = roles.find((role) => role.code === 'ADMIN');
        const superAdminRole = roles.find((role) => role.code === 'SUPER_ADMIN');
        if (!adminRole || !superAdminRole) {
          throw new ConflictException('Admin and Super Admin roles must be configured');
        }

        const currentAssignments = await tx.userRole.findMany({
          where: { roleId: superAdminRole.id },
          include: { user: { include: userInclude } },
        });
        if (currentAssignments.length !== 1) {
          throw new ConflictException('The system must have exactly one Super Admin');
        }

        const currentAssignment = currentAssignments[0]!;
        if (currentAssignment.userId !== actor.id) {
          throw new ConflictException('Only the current Super Admin can transfer ownership');
        }

        const target = await tx.user.findFirst({
          where: { id: targetUserId, status: 'ACTIVE', deletedAt: null },
          include: userInclude,
        });
        if (!target) {
          throw new NotFoundException(`Active user ${targetUserId} was not found`);
        }
        if (!assignedRoleCodes(target).includes('ADMIN')) {
          throw new ApiException('RULE_VIOLATION', 'Only an existing Admin can become Super Admin');
        }
        if (assignedRoleCodes(target).includes('REVIEWER')) {
          await this.workload.assertNoPendingWork(tx, target);
        }

        await tx.userRole.upsert({
          where: { userId_roleId: { userId: actor.id, roleId: adminRole.id } },
          create: { userId: actor.id, roleId: adminRole.id, grantedBy: actor.id },
          update: {},
        });
        await tx.userRole.delete({
          where: { userId_roleId: { userId: actor.id, roleId: superAdminRole.id } },
        });
        await tx.userRole.create({
          data: { userId: target.id, roleId: superAdminRole.id, grantedBy: actor.id },
        });
        await tx.userRole.deleteMany({
          where: { userId: target.id, roleId: { not: superAdminRole.id } },
        });

        const updatedTarget = await tx.user.findUniqueOrThrow({
          where: { id: target.id },
          include: userInclude,
        });
        await this.audit.record(tx, actor, {
          actionType: 'SUPER_ADMIN_TRANSFERRED',
          entityType: 'USER',
          entityId: target.id,
          targetUserId: target.id,
          description: `${actor.name} transferred Super Admin ownership to ${target.fullName}`,
          oldValue: { superAdminUserId: actor.id },
          newValue: { superAdminUserId: target.id },
        });
        return { target, response: toUserResponse(updatedTarget) };
      });
      this.notifyRoles(transferred.target, actor.name, ['SUPER_ADMIN']);
      return transferred.response;
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }

  private async getUser(userId: string): Promise<UserWithRoles> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: userInclude,
    });
    if (!user) throw new NotFoundException(`User ${userId} was not found`);
    return user;
  }

  private async getRole(roleId: number) {
    const role = await this.prisma.role.findFirst({ where: { id: roleId, deletedAt: null } });
    if (!role) throw new NotFoundException(`Role ${roleId} was not found`);
    return role;
  }

  private availableRoleCode(code: string): RoleCode {
    if (!isRoleCode(code)) {
      throw new BadRequestException(`Role ${code} is not available for assignment`);
    }
    return code;
  }
}

function currentRoleValue(user: UserWithRoles): RoleCode[] {
  return assignedRoleCodes(user);
}
