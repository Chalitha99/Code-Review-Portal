import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class AssignReviewerDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  reviewerId!: string;

  @ApiPropertyOptional({ description: 'Reason for replacing the active reviewer' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reason?: string;
}
