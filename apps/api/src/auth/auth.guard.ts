import { CanActivate, ExecutionContext, Inject, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Role, isStaffRole } from '@vighnaway/contracts';
import type { Request } from 'express';
import { ApiException } from '../common/errors';
import { AuthService } from './auth.service';
import type { AuthContext } from './auth.types';

export type AuthedRequest = Request & { auth?: AuthContext | null };

export const bearerOf = (req: Request): string | null => {
  const m = /^Bearer\s+(.+)$/i.exec((req.headers.authorization ?? '').trim());
  return m ? m[1]!.trim() : null;
};

/** The signed-in person for this request, or null (no header, a stale token and the shared operator token all give null). */
export async function optionalAuth(auth: AuthService, req: AuthedRequest): Promise<AuthContext | null> {
  if (req.auth !== undefined) return req.auth;
  const token = bearerOf(req);
  req.auth = token ? await auth.authenticate(token) : null;
  return req.auth;
}

/** Requires a valid session of any role. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const ctx = await optionalAuth(this.auth, req);
    if (!ctx) throw new ApiException('UNAUTHORIZED', 'Sign in to continue');
    return true;
  }
}

export const ROLES_KEY = 'roles';
/** Limits a route to these roles. Use after SessionGuard. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    if (!req.auth) throw new ApiException('UNAUTHORIZED', 'Sign in to continue');
    if (roles && !roles.includes(req.auth.user.role)) throw new ApiException('FORBIDDEN', 'Your account cannot do this');
    return true;
  }
}

export { isStaffRole };
