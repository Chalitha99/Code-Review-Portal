import { PartialType } from '@nestjs/swagger';
import { CreateChecklistSectionDto } from './create-checklist-section.dto.js';

export class UpdateChecklistSectionDto extends PartialType(
  CreateChecklistSectionDto,
) {}

