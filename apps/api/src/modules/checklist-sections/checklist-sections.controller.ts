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
import { ChecklistSectionsService } from './checklist-sections.service.js';
import { CreateChecklistSectionDto } from './dto/create-checklist-section.dto.js';
import { UpdateChecklistSectionDto } from './dto/update-checklist-section.dto.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CreateChecklistCategoryDto } from './dto/create-checklist-category.dto.js';
import { UpdateChecklistCategoryDto } from './dto/update-checklist-category.dto.js';
import { ReorderDto } from '../../common/dto/reorder.dto.js';

@ApiTags('Checklist Sections')
@Controller('checklist-sections')
export class ChecklistSectionsController {
  constructor(private readonly checklistSections: ChecklistSectionsService) {}

  // Admin catalogue tooling only: these return retired rows too. Developers and
  // reviewers read the published checklist through GET /checklist-template.
  @Get()
  @Roles('ADMIN')
  @ApiOkResponse()
  findAll() {
    return this.checklistSections.findAll();
  }

  @Get(':id')
  @Roles('ADMIN')
  @ApiOkResponse()
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.checklistSections.findOne(id);
  }

  @Post()
  @Roles('ADMIN')
  @ApiCreatedResponse()
  create(@Body() dto: CreateChecklistSectionDto) {
    return this.checklistSections.create(dto);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOkResponse()
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateChecklistSectionDto) {
    return this.checklistSections.update(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.checklistSections.remove(id);
  }
}

@ApiTags('Checklist Categories')
@Controller('checklist-categories')
export class ChecklistCategoriesController {
  constructor(private readonly checklistSections: ChecklistSectionsService) {}

  // Admin catalogue tooling only: these return retired rows too. Developers and
  // reviewers read the published checklist through GET /checklist-template.
  @Get()
  @Roles('ADMIN')
  @ApiOkResponse()
  findAll() {
    return this.checklistSections.findCategories();
  }

  /** Declared before `:id` so "order" is never parsed as an id. */
  @Patch('order')
  @Roles('ADMIN')
  @ApiOkResponse()
  reorder(@Body() dto: ReorderDto) {
    return this.checklistSections.reorderCategories(dto.ids);
  }

  @Patch(':id/question-order')
  @Roles('ADMIN')
  @ApiOkResponse()
  reorderQuestions(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReorderDto) {
    return this.checklistSections.reorderQuestions(id, dto.ids);
  }

  @Get(':id')
  @Roles('ADMIN')
  @ApiOkResponse()
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.checklistSections.findCategory(id);
  }

  @Post()
  @Roles('ADMIN')
  @ApiCreatedResponse()
  create(@Body() dto: CreateChecklistCategoryDto) {
    return this.checklistSections.createCategory(dto);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOkResponse()
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateChecklistCategoryDto) {
    return this.checklistSections.updateCategory(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.checklistSections.removeCategory(id);
  }
}
