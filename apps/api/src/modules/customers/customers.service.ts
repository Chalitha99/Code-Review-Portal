import { Injectable, NotFoundException } from '@nestjs/common';
import { CustomerStatus, type Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { rethrowPrismaConflict } from '../../common/prisma-errors.js';
import type { CreateCustomerDto } from './dto/create-customer.dto.js';
import type { UpdateCustomerDto } from './dto/update-customer.dto.js';
import { formatTaskCode } from '../review-tasks/task-code.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { AuditService } from '../audit/audit.service.js';
import { ApiException } from '../../common/api-error.js';
import { reasonMetadata } from '../../common/dto/reason.dto.js';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}
  async findAll() {
    const customers = await this.prisma.customer.findMany({
      include: { creator: true },
      orderBy: { name: 'asc' },
    });
    return customers.map((customer) => this.toResponse(customer));
  }
  async findOne(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: { creator: true },
    });
    if (!customer) throw new NotFoundException(`Customer ${id} was not found`);
    return this.toResponse(customer);
  }
  async nextTaskId(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException(`Customer ${id} was not found`);
    const aggregate = await this.prisma.task.aggregate({
      where: { customerId: id },
      _max: { customerSequenceNo: true },
    });
    const sequence = (aggregate._max.customerSequenceNo ?? 0) + 1;
    return { taskCode: formatTaskCode(customer.name, sequence), sequence };
  }
  async create(dto: CreateCustomerDto, actor: AuthenticatedUser) {
    await this.assertNameFree(dto.name);
    try {
      const customer = await this.prisma.$transaction(async (tx) => {
        const name = dto.name.trim();
        const code = await this.nextCode(tx, name);
        const created = await tx.customer.create({
          data: {
            code,
            name,
            description: dto.description?.trim() ?? null,
            color: dto.color,
            createdBy: actor.id,
          },
          include: { creator: true },
        });
        await this.audit.record(tx, actor, {
          actionType: 'CUSTOMER_CREATED',
          entityType: 'CUSTOMER',
          entityId: created.id,
          description: `${actor.name} created customer ${created.name}`,
          newValue: { code: created.code, name: created.name, status: created.status },
        });
        return created;
      });
      return this.toResponse(customer);
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }

  /** Customer names are unique ignoring case, as the web client checks them. */
  private async assertNameFree(rawName: string, exceptId?: string) {
    const clash = await this.prisma.customer.findFirst({
      where: {
        name: { equals: rawName.trim(), mode: 'insensitive' },
        ...(exceptId === undefined ? {} : { id: { not: exceptId } }),
      },
      select: { id: true },
    });
    if (clash) {
      throw new ApiException('NAME_TAKEN', 'A customer with that name already exists.');
    }
  }

  private async nextCode(tx: Prisma.TransactionClient, name: string): Promise<string> {
    const base = (name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6) || 'CUST').toUpperCase();
    const existing = await tx.customer.findMany({
      where: { code: { startsWith: base } },
      select: { code: true },
    });
    const used = new Set(existing.map(({ code }) => code));
    if (!used.has(base)) return base;

    let suffix = 2;
    while (used.has(`${base}${String(suffix)}`)) suffix += 1;
    return `${base}${String(suffix)}`;
  }
  async update(id: string, dto: UpdateCustomerDto, actor: AuthenticatedUser) {
    const existing = await this.findOne(id);
    if (dto.name !== undefined) await this.assertNameFree(dto.name, id);
    try {
      const customer = await this.prisma.$transaction(async (tx) => {
        const { isActive } = dto;
        const updatedStatus =
          isActive === undefined
            ? undefined
            : isActive
              ? CustomerStatus.ACTIVE
              : CustomerStatus.INACTIVE;
        // `code` is deliberately not updatable: it is derived once, at creation.
        const updated = await tx.customer.update({
          where: { id },
          data: {
            ...(updatedStatus === undefined ? {} : { status: updatedStatus }),
            ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
            ...(dto.description === undefined ? {} : { description: dto.description.trim() }),
            ...(dto.color === undefined ? {} : { color: dto.color }),
          },
          include: { creator: true },
        });
        const actionType =
          updatedStatus === undefined
            ? 'CUSTOMER_UPDATED'
            : updatedStatus === CustomerStatus.ACTIVE
              ? 'CUSTOMER_ACTIVATED'
              : 'CUSTOMER_DEACTIVATED';
        await this.audit.record(tx, actor, {
          actionType,
          entityType: 'CUSTOMER',
          entityId: id,
          description: `${actor.name} ${actionType.toLowerCase().replaceAll('_', ' ')} ${existing.name}`,
          oldValue: existing,
          newValue: this.toResponse(updated),
        });
        return updated;
      });
      return this.toResponse(customer);
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }
  /**
   * Permanent delete (Super Admin only, enforced by the controller). A customer
   * that any task references is part of the record: deactivate it instead.
   */
  async remove(id: string, actor: AuthenticatedUser, reason?: string) {
    if (!reason?.trim()) {
      throw new ApiException('REASON_REQUIRED', 'Provide a reason for deleting this customer.');
    }
    const existing = await this.findOne(id);
    if ((await this.prisma.task.count({ where: { customerId: id } })) > 0) {
      throw new ApiException(
        'CUSTOMER_IN_USE',
        'This customer has tasks. Deactivate them instead.',
      );
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const deleted = await tx.customer.delete({ where: { id } });
        await this.audit.record(tx, actor, {
          actionType: 'CUSTOMER_DELETED',
          entityType: 'CUSTOMER',
          entityId: id,
          description: `${actor.name} deleted customer ${existing.name}`,
          oldValue: existing,
          metadata: { targetLabel: existing.name, ...reasonMetadata(reason) },
        });
        return deleted;
      });
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }

  private toResponse(customer: {
    id: string;
    code: string;
    name: string;
    description: string | null;
    color: string | null;
    status: string;
  }) {
    return {
      id: customer.id,
      code: customer.code,
      name: customer.name,
      description: customer.description ?? '',
      color: customer.color ?? '#64748b',
      isActive: customer.status === 'ACTIVE',
    };
  }
}
