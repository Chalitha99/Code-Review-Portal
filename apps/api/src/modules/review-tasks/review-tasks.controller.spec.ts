import { describe, expect, it } from 'vitest';
import { REQUIRED_ROLES } from '../auth/auth.constants.js';
import { ReviewTasksController } from './review-tasks.controller.js';

describe('ReviewTasksController discard authorization', () => {
  it('allows the service to authorize Developer and Admin discard requests', () => {
    const handler = Object.getOwnPropertyDescriptor(ReviewTasksController.prototype, 'remove')
      ?.value as object;

    expect(Reflect.getMetadata(REQUIRED_ROLES, handler)).toEqual(['DEVELOPER', 'ADMIN']);
  });

  it('restricts task cancellation to Admin roles', () => {
    const handler = Object.getOwnPropertyDescriptor(ReviewTasksController.prototype, 'cancel')
      ?.value as object;

    expect(Reflect.getMetadata(REQUIRED_ROLES, handler)).toEqual(['ADMIN']);
  });
});
