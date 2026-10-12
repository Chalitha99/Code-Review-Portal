import { Global, Module } from '@nestjs/common';
import { ReviewerWorkloadService } from './reviewer-workload.service.js';

/** Global: both Users and UserRoles guard reviewer removal with it. */
@Global()
@Module({
  providers: [ReviewerWorkloadService],
  exports: [ReviewerWorkloadService],
})
export class ReviewerWorkloadModule {}
