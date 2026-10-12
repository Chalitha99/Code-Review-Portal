import { SetMetadata } from '@nestjs/common';
import { REQUIRED_ROLES, type RoleCode } from '../auth.constants.js';

export const Roles = (...roles: RoleCode[]) => SetMetadata(REQUIRED_ROLES, roles);

