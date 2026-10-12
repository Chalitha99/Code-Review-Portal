import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { RolesService } from './roles.service.js';

describe('RolesService soft deletion', () => {
  it('hides deleted roles from normal lists', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new RolesService({ role: { findMany } } as never);

    await service.findAll();

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { deletedAt: null } }));
  });

  it('marks a role deleted without removing its record', async () => {
    const update = vi.fn().mockResolvedValue({});
    const prisma = {
      role: {
        findFirst: vi.fn().mockResolvedValue({ id: 7, userRoles: [] }),
        update,
      },
    };
    const service = new RolesService(prisma as never);

    await service.remove(7);

    expect(update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('preserves roles that are still assigned to active users', async () => {
    const update = vi.fn();
    const prisma = {
      role: {
        findFirst: vi.fn().mockResolvedValue({ id: 7, userRoles: [{ userId: 'user-id' }] }),
        update,
      },
    };
    const service = new RolesService(prisma as never);

    await expect(service.remove(7)).rejects.toBeInstanceOf(ConflictException);
    expect(update).not.toHaveBeenCalled();
  });
});
