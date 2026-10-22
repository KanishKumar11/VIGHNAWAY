import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config';
import { AdminUsersController, AuthController, MeController } from './auth.controller';
import { RolesGuard, SessionGuard } from './auth.guard';
import { DrizzleAuthRepo } from './auth.repo.drizzle';
import { AuthService } from './auth.service';
import { AUTH_REPO, MAILER } from './auth.types';
import { createMailer } from './mailer';

/** Global so any module's guards (operator actions, optional reporter identity) can reach AuthService. */
@Global()
@Module({
  controllers: [AuthController, MeController, AdminUsersController],
  providers: [
    { provide: AUTH_REPO, useClass: DrizzleAuthRepo },
    { provide: MAILER, inject: [APP_CONFIG], useFactory: (config: AppConfig) => createMailer(config) },
    AuthService,
    SessionGuard,
    RolesGuard,
  ],
  exports: [AuthService, AUTH_REPO, SessionGuard, RolesGuard],
})
export class AuthModule {}
