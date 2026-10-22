import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import {
  AdminCreateUserBodySchema,
  type AdminUserResponse,
  type AdminUsersResponse,
  AdminUpdateUserBodySchema,
  type AuthSessionResponse,
  type MeResponse,
  type MyStatsResponse,
  OtpRequestBodySchema,
  type OtpRequestResponse,
  OtpVerifyBodySchema,
} from '@vighnaway/contracts';
import type { Request } from 'express';
import { ApiException } from '../common/errors';
import { parseIdOr404, parseOr400 } from '../common/validation';
import { type AuthedRequest, RolesGuard, Roles, SessionGuard } from './auth.guard';
import { AuthService, toAuthUser } from './auth.service';

const authOf = (req: AuthedRequest) => {
  if (!req.auth) throw new ApiException('UNAUTHORIZED', 'Sign in to continue');
  return req.auth;
};

/** Email one-time-code sign-in. Both steps are public; everything else needs the session token. */
@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('otp/request')
  @HttpCode(200)
  requestOtp(@Body() body: unknown, @Req() req: Request): Promise<OtpRequestResponse> {
    const input = parseOr400(OtpRequestBodySchema, body);
    return this.auth.requestOtp(input.email, input.client, req.ip ?? null);
  }

  @Post('otp/verify')
  @HttpCode(200)
  verifyOtp(@Body() body: unknown): Promise<AuthSessionResponse> {
    return this.auth.verifyOtp(parseOr400(OtpVerifyBodySchema, body));
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(SessionGuard)
  async logout(@Req() req: AuthedRequest): Promise<void> {
    await this.auth.logout(authOf(req).sessionId);
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@Req() req: AuthedRequest): MeResponse {
    const ctx = authOf(req);
    return { user: toAuthUser(ctx.user), client: ctx.client };
  }
}

@Controller('me')
export class MeController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  /** Counts for the signed-in reporter. A thank-you only: nothing reads it when planning a route. */
  @Get('stats')
  @UseGuards(SessionGuard)
  stats(@Req() req: AuthedRequest): Promise<MyStatsResponse> {
    return this.auth.stats(authOf(req).user.id);
  }
}

@Controller('admin/users')
@UseGuards(SessionGuard, RolesGuard)
@Roles('admin')
export class AdminUsersController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Get()
  async list(): Promise<AdminUsersResponse> {
    return { users: await this.auth.listUsers() };
  }

  @Post()
  @HttpCode(201)
  async create(@Body() body: unknown): Promise<AdminUserResponse> {
    const input = parseOr400(AdminCreateUserBodySchema, body);
    return { user: await this.auth.createUser(input.email, input.role) };
  }

  @Post(':userId')
  @HttpCode(200)
  async update(@Param('userId') rawId: string, @Body() body: unknown, @Req() req: AuthedRequest): Promise<AdminUserResponse> {
    const id = parseIdOr404(rawId, 'user');
    const input = parseOr400(AdminUpdateUserBodySchema, body);
    return { user: await this.auth.updateUser(authOf(req).user.id, id, input) };
  }
}
