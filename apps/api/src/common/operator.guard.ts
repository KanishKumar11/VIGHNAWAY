import { CanActivate, ExecutionContext, Inject, Injectable, Logger } from '@nestjs/common';
import { isStaffRole } from '@vighnaway/contracts';
import type { Request } from 'express';
import { type AuthedRequest, optionalAuth } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { APP_CONFIG, type AppConfig } from '../config';
import { ApiException } from './errors';
import { constantTimeEqual } from './hash';

/**
 * Allows an operator action when the Bearer credential is either the shared OPERATOR_TOKEN (the
 * scripted demo and tools, compared in constant time) or the session of an operator or admin account.
 * A citizen session is refused with 403; anything else is 401.
 */
@Injectable()
export class OperatorGuard implements CanActivate {
  private readonly logger = new Logger('OperatorGuard');
  private warned = false;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization ?? '';
    const m = /^Bearer\s+(.+)$/i.exec(header.trim());
    const expected = this.config.operatorToken;

    if (m && expected && constantTimeEqual(m[1]!.trim(), expected)) return true;

    const ctx = m ? await optionalAuth(this.auth, req as AuthedRequest) : null;
    if (ctx) {
      if (isStaffRole(ctx.user.role)) return true;
      throw new ApiException('FORBIDDEN', 'Only operators can do this');
    }
    if (!expected && !m && !this.warned) {
      this.logger.warn('OPERATOR_TOKEN is not set and no operator session was sent: operator actions are refused');
      this.warned = true;
    }
    throw new ApiException('UNAUTHORIZED', 'Operator token missing or wrong');
  }
}
