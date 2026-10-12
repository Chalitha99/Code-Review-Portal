import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CreateUserRoleDto } from './dto/create-user-role.dto.js';
import { UpdateUserRoleDto } from './dto/update-user-role.dto.js';
import { UserRoleQueryDto } from './dto/user-role-query.dto.js';
import { UserRolesService } from './user-roles.service.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';

@ApiTags('User Roles')
@Controller('user-roles')
@Roles('ADMIN', 'SUPER_ADMIN')
export class UserRolesController {
  constructor(private readonly userRoles: UserRolesService) {}

  @Get()
  @ApiOkResponse()
  findAll(@Query() query: UserRoleQueryDto) {
    return this.userRoles.findAll(query);
  }

  @Get(':userId/:roleId')
  @ApiOkResponse()
  findOne(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('roleId', ParseIntPipe) roleId: number,
  ) {
    return this.userRoles.findOne(userId, roleId);
  }

  @Post()
  @ApiCreatedResponse()
  create(@Body() dto: CreateUserRoleDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.userRoles.create(dto, actor);
  }

  @Patch(':userId/:roleId')
  @ApiOkResponse()
  update(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('roleId', ParseIntPipe) roleId: number,
    @Body() dto: UpdateUserRoleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    void dto;
    return this.userRoles.update(userId, roleId, { grantedBy: actor.id }, actor);
  }

  @Delete(':userId/:roleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  remove(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('roleId', ParseIntPipe) roleId: number,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.userRoles.remove(userId, roleId, actor);
  }
}
