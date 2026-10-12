import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ChecklistQuestionsService } from './checklist-questions.service.js';
import { CreateChecklistQuestionDto } from './dto/create-checklist-question.dto.js';
import { UpdateChecklistQuestionDto } from './dto/update-checklist-question.dto.js';
import { Roles } from '../auth/decorators/roles.decorator.js';

@ApiTags('Checklist Questions')
@Controller('checklist-questions')
export class ChecklistQuestionsController {
  constructor(private readonly checklistQuestions: ChecklistQuestionsService) {}

  // Admin catalogue tooling only: these return retired rows too. Developers and
  // reviewers read the published checklist through GET /checklist-template.
  @Get()
  @Roles('ADMIN')
  @ApiOkResponse()
  findAll() {
    return this.checklistQuestions.findAll();
  }

  @Get(':id')
  @Roles('ADMIN')
  @ApiOkResponse()
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.checklistQuestions.findOne(id);
  }

  @Post()
  @Roles('ADMIN')
  @ApiCreatedResponse()
  create(@Body() dto: CreateChecklistQuestionDto) {
    return this.checklistQuestions.create(dto);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOkResponse()
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateChecklistQuestionDto) {
    return this.checklistQuestions.update(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.checklistQuestions.remove(id);
  }
}
