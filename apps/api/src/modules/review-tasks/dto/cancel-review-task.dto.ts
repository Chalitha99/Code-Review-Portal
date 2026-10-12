import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

export class CancelReviewTaskDto {
  @ApiProperty({ description: 'Reason for cancelling the task', maxLength: 2000 })
  @IsString()
  @Matches(/\S/, { message: 'reason must contain at least one non-whitespace character' })
  @MaxLength(2000)
  reason!: string;
}
