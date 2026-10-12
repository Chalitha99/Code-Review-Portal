import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { AuditService } from './audit.service.js';
import { AuditLogQueryDto } from './dto/audit-log-query.dto.js';

@ApiTags('Activity Log')
@Controller('audit-logs')
@Roles('ADMIN', 'SUPER_ADMIN')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOkResponse()
  findAll(@Query() query: AuditLogQueryDto) {
    return this.audit.findAll(query);
  }
}

@ApiTags('System Audit')
@Controller('system-audit-events')
@Roles('SUPER_ADMIN')
export class SystemAuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOkResponse()
  findAll() {
    return this.audit.findSystemEvents();
  }
}
