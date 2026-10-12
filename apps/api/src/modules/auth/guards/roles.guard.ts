import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PUBLIC_ROUTE, REQUIRED_ROLES, type RoleCode } from '../auth.constants.js';
import type { AuthenticatedRequest } from '../auth.types.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<RoleCode[]>(REQUIRED_ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);

    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!required?.length) return true;

    if (required.some((role) => user.roles.includes(role))) return true;
    if (user.roles.includes('SUPER_ADMIN') && required.includes('ADMIN')) return true;
    throw new ForbiddenException('You do not have permission to perform this action');
  }
}
