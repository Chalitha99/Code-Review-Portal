import { Module } from '@nestjs/common';
import { ReviewTasksModule } from '../review-tasks/review-tasks.module.js';
import { ReviewsController } from './reviews.controller.js';
import { ReviewsService } from './reviews.service.js';

@Module({
  imports: [ReviewTasksModule],
  controllers: [ReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
