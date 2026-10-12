import { Module } from '@nestjs/common';
import {
  ChecklistsController,
  ChecklistTemplateController,
} from './checklists.controller.js';
import { ChecklistsService } from './checklists.service.js';

@Module({
  controllers: [ChecklistsController, ChecklistTemplateController],
  providers: [ChecklistsService],
})
export class ChecklistsModule {}
