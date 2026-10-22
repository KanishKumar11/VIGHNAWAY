import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type AdminUser,
  type AuthSessionResponse,
  type AuthUser,
  type Client,
  type MyStatsResponse,
  type OtpRequestResponse,
  type OtpVerifyBody,
  type Role,
  canSignInOn,
} from '@vighnaway/contracts';
import { ApiException } from '../common/errors';
import { APP_CONFIG, type AppConfig } from '../config';
import { saltedHash } from '../common/hash';
import { constantTimeEqual } from '../common/hash';
import { generateOtpCode, generateSessionToken, hashOtp, hashSessionToken, newId } from './auth.crypto';
import { AUTH_REPO, type AuthContext, type AuthRepo, MAILER, type Mailer, type UserEntity } from './auth.types';

const HOUR_MS = 3_600_000;
const INVALID_CODE = 'That code is not valid or has expired. Ask for a new one.';

export const toAuthUser = (u: UserEntity): AuthUser => ({ id: u.id, email: u.email, role: u.role, displayName: u.displayName });

export const toAdminUser = (u: UserEntity): AdminUser => ({
  ...toAuthUser(u),
  disabled: u.disabled,
  createdAt: u.createdAt.toISOString(),
  lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
});

/** What a staff account is told when it tries the phone app. */
const WRONG_CLIENT: Record<Client, string> = {
  mobile: 'Staff accounts sign in on the web console, not in the phone app.',
  web: 'This account cannot sign in on the web.',
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger('AuthService');

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(AUTH_REPO) private readonly repo: AuthRepo,
    @Inject(MAILER) private readonly mailer: Mailer,
    /** Overridable so tests control time. */
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private get a() {
    return this.config.auth;
  }

  /**
   * Sends a one-time code. The response never says whether the email has an account, and the
   * cooldown and hourly caps apply to every email alike, so it cannot be used to find accounts.
   */
  async requestOtp(email: string, client: Client, ip: string | null): Promise<OtpRequestResponse> {
    const now = this.clock();
    const ipHash = ip ? saltedHash(this.config.deviceHashSalt, `ip:${ip}`) : null;

    const latest = await this.repo.latestOtp(email);
    if (latest) {
      const waitS = Math.ceil((latest.createdAt.getTime() + this.a.otpResendS * 1000 - now.getTime()) / 1000);
      if (waitS > 0) throw new ApiException('RATE_LIMITED', `Wait ${waitS} seconds before asking for another code`, { retryAfterS: waitS });
    }
    const since = new Date(now.getTime() - HOUR_MS);
    if ((await this.repo.countOtps({ email, since })) >= this.a.otpMaxPerEmailPerHour) {
      throw new ApiException('RATE_LIMITED', 'Too many codes for this email. Try again in an hour');
    }
    if (ipHash && (await this.repo.countOtps({ ipHash, since })) >= this.a.otpMaxPerIpPerHour) {
      throw new ApiException('RATE_LIMITED', 'Too many codes from this network. Try again in an hour');
    }

    const code = generateOtpCode();
    await this.repo.insertOtp({
      id: newId(),
      email,
      codeHash: hashOtp(this.a.secret, email, code),
      client,
      ipHash,
      attempts: 0,
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.a.otpTtlS * 1000),
      consumedAt: null,
    });
    try {
      await this.mailer.sendOtp(email, code, Math.round(this.a.otpTtlS / 60));
    } catch (err) {
      this.logger.error(`Could not send a sign-in code: ${err instanceof Error ? err.message : String(err)}`);
      throw new ApiException('INTERNAL', 'Could not send the code. Try again shortly');
    }
    return { sent: true, expiresInS: this.a.otpTtlS, resendAfterS: this.a.otpResendS };
  }

  /** Checks the code, creates the account on first sign-in, and starts a session for `body.client`. */
  async verifyOtp(body: OtpVerifyBody): Promise<AuthSessionResponse> {
    const now = this.clock();
    const otp = await this.repo.latestOtp(body.email);
    if (!otp || otp.consumedAt || otp.expiresAt <= now) throw new ApiException('UNAUTHORIZED', INVALID_CODE);
    const attempts = await this.repo.incrementOtpAttempts(otp.id);
    if (attempts > this.a.otpMaxAttempts) throw new ApiException('UNAUTHORIZED', INVALID_CODE);
    if (!constantTimeEqual(hashOtp(this.a.secret, body.email, body.code), otp.codeHash)) {
      throw new ApiException('UNAUTHORIZED', INVALID_CODE);
    }
    if (!(await this.repo.consumeOtp(otp.id, now))) throw new ApiException('UNAUTHORIZED', INVALID_CODE);

    let user = await this.repo.findUserByEmail(body.email);
    const isBootstrapAdmin = this.a.adminEmails.includes(body.email);
    if (!user) {
      user = await this.repo.createUser({
        id: newId(),
        email: body.email,
        role: isBootstrapAdmin ? 'admin' : 'citizen',
        displayName: body.displayName ?? null,
        disabled: false,
        createdAt: now,
        lastLoginAt: null,
      });
    } else if (isBootstrapAdmin && user.role !== 'admin') {
      user = (await this.repo.updateUser(user.id, { role: 'admin' })) ?? user;
    }
    if (user.disabled) throw new ApiException('FORBIDDEN', 'This account is disabled');
    if (!canSignInOn(user.role, body.client)) throw new ApiException('FORBIDDEN', WRONG_CLIENT[body.client]);

    user = (await this.repo.updateUser(user.id, { lastLoginAt: now })) ?? user;
    const token = generateSessionToken();
    const ttlS = body.client === 'mobile' ? this.a.sessionTtlMobileS : this.a.sessionTtlWebS;
    const expiresAt = new Date(now.getTime() + ttlS * 1000);
    await this.repo.insertSession({
      id: newId(),
      userId: user.id,
      tokenHash: hashSessionToken(token),
      client: body.client,
      createdAt: now,
      expiresAt,
      revokedAt: null,
    });
    return { token, expiresAt: expiresAt.toISOString(), user: toAuthUser(user) };
  }

  /**
   * The signed-in person behind a bearer token, or null. Role and disabled state are read live,
   * so a role change or disable takes effect on the next request.
   */
  async authenticate(token: string): Promise<AuthContext | null> {
    if (!token.startsWith('vws_')) return null;
    const session = await this.repo.findSessionByTokenHash(hashSessionToken(token));
    if (!session || session.revokedAt || session.expiresAt <= this.clock()) return null;
    const user = await this.repo.findUserById(session.userId);
    if (!user || user.disabled || !canSignInOn(user.role, session.client)) return null;
    return { user, sessionId: session.id, client: session.client };
  }

  async logout(sessionId: string): Promise<void> {
    await this.repo.revokeSession(sessionId, this.clock());
  }

  stats(userId: string): Promise<MyStatsResponse> {
    return this.repo.reportStats(userId);
  }

  async listUsers(): Promise<AdminUser[]> {
    return (await this.repo.listUsers(500)).map(toAdminUser);
  }

  /** Gives an email a role before its first sign-in (how operators are added). */
  async createUser(email: string, role: Role): Promise<AdminUser> {
    if (await this.repo.findUserByEmail(email)) throw new ApiException('CONFLICT', 'An account with this email already exists');
    const user = await this.repo.createUser({
      id: newId(),
      email,
      role,
      displayName: null,
      disabled: false,
      createdAt: this.clock(),
      lastLoginAt: null,
    });
    return toAdminUser(user);
  }

  /** An admin cannot change their own account, and the last active admin cannot be removed. */
  async updateUser(actorId: string, targetId: string, patch: { role?: Role; disabled?: boolean }): Promise<AdminUser> {
    const target = await this.repo.findUserById(targetId);
    if (!target) throw new ApiException('NOT_FOUND', 'Unknown user');
    if (target.id === actorId) throw new ApiException('CONFLICT', 'You cannot change your own role or disable your own account');
    const losesAdmin = target.role === 'admin' && !target.disabled && ((patch.role !== undefined && patch.role !== 'admin') || patch.disabled === true);
    if (losesAdmin && (await this.repo.countActiveAdmins()) <= 1) {
      throw new ApiException('CONFLICT', 'At least one active admin is required');
    }
    const next = await this.repo.updateUser(targetId, { role: patch.role, disabled: patch.disabled });
    if (!next) throw new ApiException('NOT_FOUND', 'Unknown user');
    if (patch.disabled === true) await this.repo.revokeUserSessions(targetId, this.clock());
    return toAdminUser(next);
  }
}
