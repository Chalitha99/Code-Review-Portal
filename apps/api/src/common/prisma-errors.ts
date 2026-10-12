import { Prisma } from '@prisma/client';
import { ApiException } from './api-error.js';

const MAX_TRANSACTION_ATTEMPTS = 3;

export async function retryPrismaTransaction<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const isRetryableConflict =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
      if (!isRetryableConflict) {
        throw error;
      }
      if (attempt === MAX_TRANSACTION_ATTEMPTS) {
        rethrowPrismaConflict(error);
      }
    }
  }

  throw new Error('Transaction retry loop completed unexpectedly');
}

/** The unique constraint's field names, lower-cased and joined ('' when Prisma omits them). */
function uniqueTarget(error: Prisma.PrismaClientKnownRequestError): string {
  const target = error.meta?.['target'];
  if (Array.isArray(target)) return target.map(String).join(',').toLowerCase();
  return typeof target === 'string' ? target.toLowerCase() : '';
}

export function rethrowPrismaConflict(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      const target = uniqueTarget(error);
      if (target.includes('email')) {
        throw new ApiException('EMAIL_TAKEN', 'A user with that email address already exists.');
      }
      if (target.includes('name') || target.includes('code')) {
        throw new ApiException('NAME_TAKEN', 'A record with that name already exists.');
      }
      throw new ApiException('NAME_TAKEN', 'A record with the same unique value already exists');
    }
    if (error.code === 'P2003' || error.code === 'P2014') {
      throw new ApiException('INVALID_STATE_TRANSITION', 'The record is referenced by other data');
    }
    if (error.code === 'P2025') {
      throw new ApiException('VALIDATION_FAILED', 'A referenced record does not exist');
    }
    if (error.code === 'P2034') {
      throw new ApiException(
        'VERSION_CONFLICT',
        'The operation conflicted with another request; please retry',
      );
    }
  }
  throw error;
}
