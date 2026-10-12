import { PartialType } from '@nestjs/swagger';
import { CreateReviewTaskDto } from './create-review-task.dto.js';

export class UpdateReviewTaskDto extends PartialType(CreateReviewTaskDto) {}

