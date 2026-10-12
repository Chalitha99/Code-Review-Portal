import { Module } from '@nestjs/common';
import {
  ChecklistCategoriesController,
  ChecklistSectionsController,
} from './checklist-sections.controller.js';
import { ChecklistSectionsService } from './checklist-sections.service.js';

@Module({
  controllers: [ChecklistSectionsController, ChecklistCategoriesController],
  providers: [ChecklistSectionsService],
})
export class ChecklistSectionsModule {}
