import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller.js';
import { EmailDispatcher } from './email-dispatcher.service.js';
import { NotificationsService } from './notifications.service.js';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, EmailDispatcher],
  exports: [NotificationsService, EmailDispatcher],
})
export class NotificationsModule {}
