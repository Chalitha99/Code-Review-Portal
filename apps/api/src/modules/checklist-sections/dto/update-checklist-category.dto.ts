import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateChecklistCategoryDto } from './create-checklist-category.dto.js';

export class UpdateChecklistCategoryDto extends PartialType(CreateChecklistCategoryDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
