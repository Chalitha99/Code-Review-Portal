import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import type { RoleCode } from '../auth/auth.constants.js';
import { ReviewsService } from './reviews.service.js';

/**
 * GET /reviews?scope=… — which reviews a caller may list. Ported from the web
 * app's former MSW suite (reviewerAnalytics "the reviews scope"), which is where
 * these rules used to be specified.
 */
function actor(roles: RoleCode[]): AuthenticatedUser {
  return {
    id: 'user-1',
    email: 'user@example.com',
    name: 'User One',
    roles,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    sessionId: 'session-1',
  };
}

function service() {
  const findMany = vi.fn().mockResolvedValue([]);
  const prisma = { codeReviewForm: { findMany } };
  return { findMany, reviews: new ReviewsService(prisma as never, {} as never, {} as never) };
}

describe('ReviewsService.findAll scopes', () => {
  it('scope=reviewer lists the reviews this user GAVE, keyed on the review', async () => {
    const { findMany, reviews } = service();
    await reviews.findAll('reviewer', actor(['REVIEWER']));
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { reviewerId: 'user-1' } }),
    );
  });

  it('refuses scope=reviewer to an account without the Reviewer role (403, not an empty list)', async () => {
    const { findMany, reviews } = service();
    await expect(reviews.findAll('reviewer', actor(['DEVELOPER']))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(findMany).not.toHaveBeenCalled();
  });

  it('scope=mine still means reviews OF my work (keyed on the task developer)', async () => {
    const { findMany, reviews } = service();
    await reviews.findAll('mine', actor(['DEVELOPER', 'REVIEWER']));
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { task: { developerId: 'user-1' } } }),
    );
  });

  it('keeps scope=all for administrators and rejects an unknown scope with 400', async () => {
    const { reviews } = service();
    await expect(reviews.findAll('all', actor(['REVIEWER']))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(reviews.findAll('everything', actor(['ADMIN']))).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      status: 400,
    });
  });
});
