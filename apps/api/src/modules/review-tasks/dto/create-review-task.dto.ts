import { ChecklistAnswerValue, TaskPriority } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Matches,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

function normalizeChecklistAnswer({ value }: TransformFnParams): unknown {
  const answer: unknown = value;
  if (answer === 'Yes') return ChecklistAnswerValue.YES;
  if (answer === 'No') return ChecklistAnswerValue.NO;
  return answer;
}

function normalizePriority({ value }: TransformFnParams): unknown {
  const priority: unknown = value;
  return typeof priority === 'string' ? priority.toUpperCase() : priority;
}

export class ChecklistAnswerDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  questionId!: string;

  @ApiProperty({ enum: ChecklistAnswerValue })
  @Transform(normalizeChecklistAnswer)
  @IsEnum(ChecklistAnswerValue)
  answer!: ChecklistAnswerValue;
}

export class CreateReviewTaskDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  customerId!: string;

  @ApiProperty({ example: 'CRIM-12345' })
  @IsString()
  @Matches(/\S/, { message: 'crimId must contain a non-whitespace character' })
  @MinLength(1)
  @MaxLength(100)
  crimId!: string;

  @ApiProperty({ enum: TaskPriority })
  @Transform(normalizePriority)
  @IsEnum(TaskPriority)
  priority!: TaskPriority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  noteToReviewer?: string | null;

  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @Type(() => Number)
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  taskTypeIds?: number[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  additionalRemarks?: string | null;

  @ApiPropertyOptional({ type: [ChecklistAnswerDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChecklistAnswerDto)
  checklistAnswers?: ChecklistAnswerDto[];
}
