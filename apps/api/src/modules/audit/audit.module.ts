import { Global, Module } from '@nestjs/common';
import { AuditController, SystemAuditController } from './audit.controller.js';
import { AuditService } from './audit.service.js';

@Global()
@Module({
  controllers: [AuditController, SystemAuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
