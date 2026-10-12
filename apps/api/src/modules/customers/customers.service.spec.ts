import { describe, expect, it, vi } from 'vitest';
import { validate } from 'class-validator';
import { CustomersService } from './customers.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { UpdateCustomerDto } from './dto/update-customer.dto.js';
import { CreateCustomerDto } from './dto/create-customer.dto.js';

const audit = { record: vi.fn().mockResolvedValue(undefined) };

describe('CustomersService next Task ID', () => {
  it('calculates the next sequence independently for each customer', async () => {
    const prisma = {
      customer: {
        findUnique: vi.fn(({ where }: { where: { id: string } }) => {
          return Promise.resolve(
            where.id === 'customer-a'
              ? { id: 'customer-a', name: 'Sample Customer A' }
              : { id: 'customer-b', name: 'Sample Customer B' },
          );
        }),
      },
      task: {
        aggregate: vi.fn(({ where }: { where: { customerId: string } }) => {
          return Promise.resolve({
            _max: { customerSequenceNo: where.customerId === 'customer-a' ? 2 : null },
          });
        }),
      },
    };
    const service = new CustomersService(prisma as never, audit as never);

    await expect(service.nextTaskId('customer-a')).resolves.toEqual({
      taskCode: 'SAMPLECUSTOMERA-03',
      sequence: 3,
    });
    await expect(service.nextTaskId('customer-b')).resolves.toEqual({
      taskCode: 'SAMPLECUSTOMERB-01',
      sequence: 1,
    });
  });
});

describe('CustomersService creation', () => {
  it('generates the immutable customer code when the frontend omits it', async () => {
    const actor: AuthenticatedUser = {
      id: '00000000-0000-4000-8000-000000000001',
      email: 'admin@example.com',
      name: 'Admin',
      roles: ['ADMIN'],
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      sessionId: 'session-id',
    };
    const created = {
      id: '00000000-0000-4000-8000-000000000002',
      name: 'Northwind Traders',
      code: 'NORTHW2',
      description: 'ERP customer',
      color: '#0f766e',
      status: 'ACTIVE',
      creator: { id: actor.id },
    };
    const tx = {
      customer: {
        findMany: vi.fn().mockResolvedValue([{ code: 'NORTHW' }]),
        create: vi.fn().mockResolvedValue(created),
      },
    };
    const prisma = {
      // No existing customer by that name (case-insensitive check).
      customer: { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn((operation: (client: typeof tx) => unknown) => operation(tx)),
    };
    const service = new CustomersService(prisma as never, audit as never);

    await expect(
      service.create(
        { name: 'Northwind Traders', description: 'ERP customer', color: '#0f766e' },
        actor,
      ),
    ).resolves.toEqual({
      id: created.id,
      name: created.name,
      code: created.code,
      description: created.description,
      color: created.color,
      isActive: true,
    });
    expect(tx.customer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ code: 'NORTHW2', name: 'Northwind Traders' }),
      }),
    );
  });
});

describe('CustomersService status updates', () => {
  it('accepts the existing frontend deactivation payload', async () => {
    const dto = Object.assign(new UpdateCustomerDto(), { isActive: false });

    await expect(validate(dto, { whitelist: true, forbidNonWhitelisted: true })).resolves.toEqual(
      [],
    );
  });

  it('translates the frontend isActive flag into the database customer status', async () => {
    const actor: AuthenticatedUser = {
      id: '00000000-0000-4000-8000-000000000001',
      email: 'admin@example.com',
      name: 'Admin',
      roles: ['ADMIN'],
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      sessionId: 'session-id',
    };
    const existing = {
      id: '00000000-0000-4000-8000-000000000002',
      name: 'Test',
      code: 'TEST',
      description: '',
      color: '#2563eb',
      status: 'ACTIVE',
      creator: null,
    };
    const updated = { ...existing, status: 'INACTIVE' };
    const tx = {
      customer: { update: vi.fn().mockResolvedValue(updated) },
    };
    const prisma = {
      customer: { findUnique: vi.fn().mockResolvedValue(existing) },
      $transaction: vi.fn((operation: (client: typeof tx) => unknown) => operation(tx)),
    };
    const service = new CustomersService(prisma as never, audit as never);

    await expect(service.update(existing.id, { isActive: false }, actor)).resolves.toMatchObject({
      id: existing.id,
      isActive: false,
    });
    expect(tx.customer.update).toHaveBeenCalledWith({
      where: { id: existing.id },
      data: { status: 'INACTIVE' },
      include: { creator: true },
    });
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      actor,
      expect.objectContaining({ actionType: 'CUSTOMER_DEACTIVATED' }),
    );
  });
});

describe('CustomersService name and delete rules', () => {
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const admin: AuthenticatedUser = {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'super@example.com',
    name: 'Super',
    roles: ['SUPER_ADMIN'],
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    sessionId: 'session',
  };

  it('refuses a case-insensitive duplicate name with NAME_TAKEN', async () => {
    const prisma = { customer: { findFirst: vi.fn().mockResolvedValue({ id: 'existing' }) } };
    const service = new CustomersService(prisma as never, audit as never);

    await expect(
      service.create({ name: 'northwind traders', color: '#2563eb' }, admin),
    ).rejects.toMatchObject({
      code: 'NAME_TAKEN',
    });
  });

  it('refuses to delete a customer that tasks reference (CUSTOMER_IN_USE)', async () => {
    const prisma = {
      customer: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'c1',
          code: 'NW',
          name: 'Northwind',
          description: null,
          color: null,
          status: 'ACTIVE',
          createdAt: new Date(),
          updatedAt: new Date(),
          creator: null,
        }),
      },
      task: { count: vi.fn().mockResolvedValue(2) },
    };
    const service = new CustomersService(prisma as never, audit as never);

    await expect(service.remove('c1', admin, 'Merged')).rejects.toMatchObject({
      code: 'CUSTOMER_IN_USE',
    });
  });
});

describe('CustomersService mock-parity rules', () => {
  const admin: AuthenticatedUser = {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'super@example.com',
    name: 'Super',
    roles: ['SUPER_ADMIN'],
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    sessionId: 'session-id',
  };

  it('does not accept a customer code from the client on create or update', async () => {
    const create = Object.assign(new CreateCustomerDto(), {
      name: 'Acme',
      color: '#2563eb',
      code: 'X',
    });
    const update = Object.assign(new UpdateCustomerDto(), { code: 'X' });
    const options = { whitelist: true, forbidNonWhitelisted: true };

    expect((await validate(create, options)).map(({ property }) => property)).toEqual(['code']);
    expect((await validate(update, options)).map(({ property }) => property)).toEqual(['code']);
  });

  it('requires a 6-digit hex colour', async () => {
    for (const color of ['#abc', '2563eb', 'blue']) {
      const dto = Object.assign(new CreateCustomerDto(), { name: 'Acme', color });
      expect((await validate(dto)).map(({ property }) => property)).toEqual(['color']);
    }
  });

  it('requires a reason before permanently deleting a customer', async () => {
    const prisma = { customer: { findUnique: vi.fn() } };
    const service = new CustomersService(prisma as never, audit as never);

    for (const reason of [undefined, '', '   ']) {
      await expect(service.remove('c1', admin, reason)).rejects.toMatchObject({
        code: 'REASON_REQUIRED',
        status: 422,
      });
    }
    expect(prisma.customer.findUnique).not.toHaveBeenCalled();
  });
});
