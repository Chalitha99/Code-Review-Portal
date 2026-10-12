import { Module } from '@nestjs/common';
import { UserRoleAssignmentsController } from './user-role-assignments.controller.js';
import { UserRolesController } from './user-roles.controller.js';
import { UserRolesService } from './user-roles.service.js';

@Module({
  controllers: [UserRolesController, UserRoleAssignmentsController],
  providers: [UserRolesService],
})
export class UserRolesModule {}

