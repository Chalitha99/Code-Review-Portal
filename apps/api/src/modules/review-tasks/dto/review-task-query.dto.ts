import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export const REVIEW_TASK_SCOPES = ['mine', 'all', 'available', 'assigned', 'history'] as const;

export type ReviewTaskScope = (typeof REVIEW_TASK_SCOPES)[number];

export class ReviewTaskQueryDto {
  @ApiPropertyOptional({ enum: REVIEW_TASK_SCOPES, default: 'mine' })
  @IsOptional()
  @IsIn(REVIEW_TASK_SCOPES)
  scope?: ReviewTaskScope;
}
