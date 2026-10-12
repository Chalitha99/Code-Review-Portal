import { Module } from '@nestjs/common';
import { ChecklistQuestionsController } from './checklist-questions.controller.js';
import { ChecklistQuestionsService } from './checklist-questions.service.js';

@Module({
  controllers: [ChecklistQuestionsController],
  providers: [ChecklistQuestionsService],
})
export class ChecklistQuestionsModule {}

