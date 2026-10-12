import { PartialType } from '@nestjs/swagger';
import { CreateTaskTypeDto } from './create-task-type.dto.js';

export class UpdateTaskTypeDto extends PartialType(CreateTaskTypeDto) {}

