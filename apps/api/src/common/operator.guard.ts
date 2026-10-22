import { CanActivate, ExecutionContext, Inject, Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { APP_CONFIG, type AppConfig } from '../config';
import { ApiException } from './errors';
import { constantTimeEqual } from './hash';

/** Requires `Authorization: Bearer <OPERATOR_TOKEN>`, compared in constant time. */
@Injectable()
export class OperatorGuard implements CanActivate {
  private readonly logger = new Logger('OperatorGuard');
  private warned = false;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization ?? '';
    const m = /^Bearer\s+(.+)$/i.exec(header.trim());
    const expected = this.config.operatorToken;
    if (!expected) {
      if (!this.warned) {
        this.logger.warn('OPERATOR_TOKEN is not set: every operator and simulation action is refused');
        this.warned = true;
      }
      throw new ApiException('UNAUTHORIZED', 'Operator token missing or wrong');
    }
    if (!m || !constantTimeEqual(m[1]!.trim(), expected)) {
      throw new ApiException('UNAUTHORIZED', 'Operator token missing or wrong');
    }
    return true;
  }
}
