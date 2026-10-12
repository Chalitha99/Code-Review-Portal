import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ChecklistsService } from './checklists.service.js';
import { ChecklistQueryDto } from './dto/checklist-query.dto.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { ApiException } from '../../common/api-error.js';

@ApiTags('Developer Checklist')
@Controller(['developer-checklist', 'developer-checklists'])
export class ChecklistsController {
  constructor(private readonly checklists: ChecklistsService) {}
  @Get() @ApiOkResponse() find(@Query() query: ChecklistQueryDto) {
    return this.checklists.findForTaskTypes(query.taskTypeIds);
  }

  @Get('questions')
  @ApiOkResponse()
  findQuestions(@Query() query: ChecklistQueryDto) {
    return this.checklists.findForTaskTypes(query.taskTypeIds);
  }
}

@ApiTags('Developer Checklist')
@Controller('checklist-template')
export class ChecklistTemplateController {
  constructor(private readonly checklists: ChecklistsService) {}

  /** Retired categories and questions (`scope=all`) are an admin view only. */
  @Get()
  @ApiOkResponse()
  findTemplate(@CurrentUser() user: AuthenticatedUser, @Query('scope') scope?: string) {
    const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('SUPER_ADMIN');
    if (scope === 'all' && !isAdmin) {
      throw new ApiException(
        'FORBIDDEN',
        'Only an administrator may view the full checklist template.',
      );
    }
    return this.checklists.findTemplate(scope === 'all');
  }
}
