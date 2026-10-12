import { Module } from '@nestjs/common';
import { ReviewTasksController, TaskIdentitiesController } from './review-tasks.controller.js';
import { ReviewTasksService } from './review-tasks.service.js';

@Module({
  controllers: [ReviewTasksController, TaskIdentitiesController],
  providers: [ReviewTasksService],
  exports: [ReviewTasksService],
})
export class ReviewTasksModule {}
