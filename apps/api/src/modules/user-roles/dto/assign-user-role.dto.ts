import { OmitType } from '@nestjs/swagger';
import { CreateUserRoleDto } from './create-user-role.dto.js';

export class AssignUserRoleDto extends OmitType(CreateUserRoleDto, [
  'userId',
] as const) {}

