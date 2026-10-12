import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateChecklistQuestionDto } from './create-checklist-question.dto.js';

export class UpdateChecklistQuestionDto extends PartialType(CreateChecklistQuestionDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
