import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Min } from 'class-validator';

export class CreateChecklistQuestionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  categoryId!: string;

  @ApiProperty({ example: 'Have all unit tests passed?' })
  @IsString()
  @Matches(/\S/, {
    message: 'text must contain a non-whitespace character',
  })
  text!: string;

  @ApiPropertyOptional({ default: 0, example: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @ApiPropertyOptional({ enum: ['replace', 'shift'] })
  @IsOptional()
  @IsIn(['replace', 'shift'])
  onDuplicateOrder?: 'replace' | 'shift';
}
