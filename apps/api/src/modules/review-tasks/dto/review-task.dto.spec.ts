import { ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { CreateReviewTaskDto } from './create-review-task.dto.js';
import { UpdateReviewTaskDto } from './update-review-task.dto.js';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

const metadata = <T>(metatype: new () => T) => ({
  type: 'body' as const,
  metatype,
  data: undefined,
});

describe('review task request DTOs', () => {
  it('accepts the task creation payload sent by the Developer wizard', async () => {
    await expect(
      pipe.transform(
        {
          customerId: '00000000-0000-4000-8000-000000000001',
          crimId: 'CRIM-1001',
          priority: 'High',
        },
        metadata(CreateReviewTaskDto),
      ),
    ).resolves.toMatchObject({
      customerId: '00000000-0000-4000-8000-000000000001',
      crimId: 'CRIM-1001',
      priority: 'HIGH',
    });
  });

  it('accepts the task update payload sent before Save Draft and Submit', async () => {
    await expect(
      pipe.transform(
        {
          customerId: '00000000-0000-4000-8000-000000000001',
          crimId: 'CRIM-1001',
          priority: 'High',
          noteToReviewer: 'Please verify the updated report.',
        },
        metadata(UpdateReviewTaskDto),
      ),
    ).resolves.toMatchObject({
      customerId: '00000000-0000-4000-8000-000000000001',
      crimId: 'CRIM-1001',
      priority: 'HIGH',
      noteToReviewer: 'Please verify the updated report.',
    });
  });
});
