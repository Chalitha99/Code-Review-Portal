import { Injectable } from '@nestjs/common';
import { Prisma, type AuditLog } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import type { AuditLogQueryDto } from './dto/audit-log-query.dto.js';
import type { SystemAuditEvent } from '@sdp/contracts';

type AuditWriter = Pick<Prisma.TransactionClient, 'auditLog'>;

export interface AuditRecordInput {
  actionType: string;
  entityType: string;
  entityId?: string | null;
  description: string;
  oldValue?: Prisma.InputJsonValue;
  newValue?: Prisma.InputJsonValue;
  taskId?: string | null;
  targetUserId?: string | null;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  record(client: AuditWriter, actor: AuthenticatedUser, input: AuditRecordInput) {
    return client.auditLog.create({
      data: {
        userId: actor.id,
        actorName: actor.name,
        actorRole: actor.roles.join(', '),
        action: input.actionType,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        description: input.description,
        ...(input.oldValue === undefined ? {} : { oldValues: input.oldValue }),
        ...(input.newValue === undefined ? {} : { newValues: input.newValue }),
        taskId: input.taskId ?? null,
        targetUserId: input.targetUserId ?? null,
        ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
      },
    });
  }

  async findAll(query: AuditLogQueryDto) {
    const needle = query.search?.trim();
    const where: Prisma.AuditLogWhereInput = {
      ...(query.actorUserId === undefined ? {} : { userId: query.actorUserId }),
      ...(query.actorRole === undefined
        ? {}
        : { actorRole: { contains: query.actorRole, mode: 'insensitive' } }),
      ...(query.actionType === undefined ? {} : { action: query.actionType }),
      ...(query.entityType === undefined ? {} : { entityType: query.entityType }),
      ...(query.dateFrom === undefined && query.dateTo === undefined
        ? {}
        : {
            createdAt: {
              ...(query.dateFrom === undefined ? {} : { gte: query.dateFrom }),
              ...(query.dateTo === undefined ? {} : { lte: query.dateTo }),
            },
          }),
      ...(needle === undefined || needle === ''
        ? {}
        : {
            OR: [
              { actorName: { contains: needle, mode: 'insensitive' } },
              { description: { contains: needle, mode: 'insensitive' } },
              { action: { contains: needle, mode: 'insensitive' } },
              { entityType: { contains: needle, mode: 'insensitive' } },
              { entityId: { contains: needle, mode: 'insensitive' } },
            ],
          }),
    };
    const page = query.page;
    const pageSize = query.pageSize;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return {
      items: items.map((item) => this.toResponse(item)),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async findSystemEvents() {
    const logs = await this.prisma.auditLog.findMany({
      where: {
        action: {
          in: [
            'ROLE_GRANTED',
            'ROLE_REMOVED',
            'ROLES_CHANGED',
            'SUPER_ADMIN_TRANSFERRED',
            'USER_ACTIVATED',
            'USER_DEACTIVATED',
            'USER_DELETED',
            'INVITE_REVOKED',
            'TASK_DELETED',
            'CUSTOMER_DELETED',
          ],
        },
        userId: { not: null },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    return logs.flatMap((log): SystemAuditEvent[] => {
      if (!log.userId) return [];
      const targetId = log.targetUserId ?? log.entityId;
      if (!targetId || !isUuid(targetId)) return [];
      const base = {
        id: log.id,
        actorId: log.userId,
        actorName: log.actorName,
        targetId,
        // The admin's own words and the target's name, recorded in metadata at
        // write time; the description is the fallback for older rows.
        targetLabel: jsonString(log.metadata, 'targetLabel') ?? log.description,
        reason: jsonString(log.metadata, 'reason') ?? log.description,
        occurredAt: log.createdAt.toISOString(),
      };
      if (log.action === 'SUPER_ADMIN_TRANSFERRED') {
        return [{ ...base, action: 'SuperAdminGranted' as const, targetType: 'User' as const }];
      }
      if (log.action === 'ROLE_GRANTED' || log.action === 'ROLE_REMOVED') {
        const role = log.description.toUpperCase().includes('SUPER ADMIN')
          ? 'SuperAdmin'
          : log.description.toUpperCase().includes('ADMIN')
            ? 'Admin'
            : null;
        if (!role) return [];
        const suffix = log.action === 'ROLE_GRANTED' ? 'Granted' : 'Revoked';
        return [
          {
            ...base,
            action: `${role}${suffix}`,
            targetType: 'User' as const,
          },
        ];
      }
      if (log.action === 'ROLES_CHANGED') {
        const oldRoles = jsonStringArray(log.oldValues);
        const newRoles = jsonStringArray(log.newValues);
        const changes = [
          ['ADMIN', 'AdminGranted', 'AdminRevoked'],
          ['SUPER_ADMIN', 'SuperAdminGranted', 'SuperAdminRevoked'],
        ] as const;
        return changes.flatMap(([role, granted, revoked]) => {
          const before = oldRoles.includes(role);
          const after = newRoles.includes(role);
          if (before === after) return [];
          return [
            {
              ...base,
              action: after ? granted : revoked,
              targetType: 'User' as const,
            },
          ];
        });
      }
      const mapped = {
        USER_ACTIVATED: 'PrivilegedUserActivated',
        USER_DEACTIVATED: 'PrivilegedUserDeactivated',
        USER_DELETED: 'UserDeleted',
        INVITE_REVOKED: 'InviteRevoked',
        TASK_DELETED: 'TaskDeleted',
        CUSTOMER_DELETED: 'CustomerDeleted',
      } as const;
      const action = mapped[log.action as keyof typeof mapped];
      if (!action) return [];
      if (
        (log.action === 'USER_ACTIVATED' || log.action === 'USER_DEACTIVATED') &&
        ![...jsonObjectRoles(log.oldValues), ...jsonObjectRoles(log.newValues)].some((role) =>
          ['ADMIN', 'SUPER_ADMIN'].includes(role),
        )
      ) {
        return [];
      }
      return [
        {
          ...base,
          action,
          targetType:
            log.action === 'TASK_DELETED'
              ? ('Task' as const)
              : log.action === 'CUSTOMER_DELETED'
                ? ('Customer' as const)
                : ('User' as const),
        },
      ];
    });
  }

  private toResponse(item: AuditLog) {
    return {
      id: item.id,
      timestamp: item.createdAt.toISOString(),
      actorUserId: item.userId,
      actorName: item.actorName,
      actorRole: item.actorRole,
      actionType: item.action,
      entityType: item.entityType,
      entityId: item.entityId,
      description: item.description,
      oldValue: item.oldValues,
      newValue: item.newValues,
      taskId: item.taskId,
      targetUserId: item.targetUserId,
      metadata: item.metadata,
    };
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function jsonStringArray(value: Prisma.JsonValue | null): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

/** A non-empty string field of a JSON object, or undefined. */
function jsonString(value: Prisma.JsonValue | null, key: string): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const field = value[key];
  return typeof field === 'string' && field.trim() !== '' ? field : undefined;
}

function jsonObjectRoles(value: Prisma.JsonValue | null): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return jsonStringArray(value['roles'] ?? null);
}
