import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { TaskTypesService } from './task-types.service.js';
import { CreateTaskTypeDto } from './dto/create-task-type.dto.js';
import { UpdateTaskTypeDto } from './dto/update-task-type.dto.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { ApiException } from '../../common/api-error.js';
import { ReorderDto } from '../../common/dto/reorder.dto.js';

@ApiTags('Task Types')
@Controller('task-types')
export class TaskTypesController {
  constructor(private readonly taskTypes: TaskTypesService) {}
  /** Inactive types (`scope=all`) are an admin view; everyone else gets the active list. */
  @Get() @ApiOkResponse() findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('scope') scope?: string,
  ) {
    const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('SUPER_ADMIN');
    if (scope === 'all' && !isAdmin) {
      throw new ApiException('FORBIDDEN', 'Only an administrator may list inactive task types.');
    }
    return this.taskTypes.findAll(scope === 'all');
  }

  /** Declared before `:id` so "order" is never parsed as an id. */
  @Patch('order')
  @Roles('ADMIN')
  @ApiOkResponse()
  reorder(@Body() dto: ReorderDto) {
    return this.taskTypes.reorder(dto.ids);
  }

  /** The raw row with its sections and usage counts: admin tooling only. */
  @Get(':id')
  @Roles('ADMIN')
  @ApiOkResponse()
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.taskTypes.findOne(id);
  }

  @Post()
  @Roles('ADMIN')
  @ApiCreatedResponse()
  create(@Body() dto: CreateTaskTypeDto) {
    return this.taskTypes.create(dto);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOkResponse()
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTaskTypeDto) {
    return this.taskTypes.update(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.taskTypes.remove(id);
  }
}
