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
  Post,
  Put,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AssignUserRoleDto } from './dto/assign-user-role.dto.js';
import { UserRolesService } from './user-roles.service.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { ReplaceUserRolesDto } from './dto/replace-user-roles.dto.js';

@ApiTags('User Roles')
@Controller('users/:userId/roles')
@Roles('ADMIN', 'SUPER_ADMIN')
export class UserRoleAssignmentsController {
  constructor(private readonly userRoles: UserRolesService) {}

  @Get()
  @ApiOkResponse()
  findForUser(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.userRoles.findForUser(userId);
  }

  @Post()
  @ApiCreatedResponse()
  assign(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: AssignUserRoleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.userRoles.create({ userId, ...dto }, actor);
  }

  @Put()
  @ApiOkResponse()
  replace(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: ReplaceUserRolesDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.userRoles.replaceForUser(userId, dto.roles, actor, dto.reason);
  }

  // An action on an existing resource, not a creation: 200, not 201.
  @HttpCode(HttpStatus.OK)
  @Post('transfer-super-admin')
  @Roles('SUPER_ADMIN')
  @ApiOkResponse()
  transferSuperAdmin(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.userRoles.transferSuperAdmin(userId, actor);
  }

  @Delete(':roleId')
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
