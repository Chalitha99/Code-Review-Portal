import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration.ts';
import { validate } from './config/env.validation.ts';
import { HealthModule } from './modules/health/health.module.ts';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard.js';
import { RolesGuard } from './modules/auth/guards/roles.guard.js';
import { CsrfGuard } from './modules/auth/guards/csrf.guard.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { CustomersModule } from './modules/customers/customers.module.js';
import { TaskTypesModule } from './modules/task-types/task-types.module.js';
import { ChecklistsModule } from './modules/checklists/checklists.module.js';
import { ReviewTasksModule } from './modules/review-tasks/review-tasks.module.js';
import { RolesModule } from './modules/roles/roles.module.js';
import { UserRolesModule } from './modules/user-roles/user-roles.module.js';
import { ChecklistSectionsModule } from './modules/checklist-sections/checklist-sections.module.js';
import { ChecklistQuestionsModule } from './modules/checklist-questions/checklist-questions.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { HandoversModule } from './modules/handovers/handovers.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { ReviewsModule } from './modules/reviews/reviews.module.js';
import { MailModule } from './integrations/mail/mail.module.js';
import { PasswordLinksModule } from './modules/password-links/password-links.module.js';
import { ReviewerWorkloadModule } from './modules/reviewer-workload/reviewer-workload.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate,
    }),
    HealthModule,
    PrismaModule,
    AuditModule,
    MailModule,
    PasswordLinksModule,
    ReviewerWorkloadModule,
    UsersModule,
    CustomersModule,
    TaskTypesModule,
    ChecklistsModule,
    ReviewTasksModule,
    HandoversModule,
    NotificationsModule,
    ReviewsModule,
    RolesModule,
    UserRolesModule,
    ChecklistSectionsModule,
    ChecklistQuestionsModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
})
export class AppModule {}
