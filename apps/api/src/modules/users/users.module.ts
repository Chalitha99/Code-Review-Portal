import { Module } from '@nestjs/common';
import { PasswordLinksModule } from '../password-links/password-links.module.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [PasswordLinksModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
