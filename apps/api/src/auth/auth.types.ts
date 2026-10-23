import type { Client, MyReport, MyStatsResponse, Role } from '@vighnaway/contracts';

export interface UserEntity {
  id: string;
  email: string;
  role: Role;
  displayName: string | null;
  disabled: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
}

export interface OtpEntity {
  id: string;
  email: string;
  codeHash: string;
  client: Client;
  ipHash: string | null;
  attempts: number;
  createdAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
}

export interface SessionEntity {
  id: string;
  userId: string;
  tokenHash: string;
  client: Client;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

/** Storage for accounts. A Drizzle implementation runs in the API; tests use an in-memory one. */
export interface AuthRepo {
  findUserByEmail(email: string): Promise<UserEntity | null>;
  findUserById(id: string): Promise<UserEntity | null>;
  createUser(user: UserEntity): Promise<UserEntity>;
  updateUser(id: string, patch: Partial<Pick<UserEntity, 'role' | 'displayName' | 'disabled' | 'lastLoginAt'>>): Promise<UserEntity | null>;
  listUsers(limit: number): Promise<UserEntity[]>;
  countActiveAdmins(): Promise<number>;

  insertOtp(otp: OtpEntity): Promise<void>;
  /** Newest code sent to this email, consumed or not. */
  latestOtp(email: string): Promise<OtpEntity | null>;
  countOtps(filter: { email?: string; ipHash?: string; since: Date }): Promise<number>;
  /** Atomically adds one attempt and returns the new count. */
  incrementOtpAttempts(id: string): Promise<number>;
  /** Marks the code used; false when it was already used (so a code works once, even in a race). */
  consumeOtp(id: string, at: Date): Promise<boolean>;

  insertSession(session: SessionEntity): Promise<void>;
  findSessionByTokenHash(tokenHash: string): Promise<SessionEntity | null>;
  revokeSession(id: string, at: Date): Promise<void>;
  revokeUserSessions(userId: string, at: Date): Promise<void>;

  reportStats(userId: string): Promise<MyStatsResponse>;
  /** The person's newest reports with the status of the incident each joined. */
  myReports(userId: string, limit: number): Promise<MyReport[]>;
  /**
   * Removes the account: sessions and sign-in codes go, the user row goes, and the person's reports stay (incidents are
   * built from them) with the link to the person cleared.
   */
  deleteAccount(userId: string, email: string): Promise<void>;
}

export const AUTH_REPO = Symbol('AUTH_REPO');
export const MAILER = Symbol('MAILER');

export interface Mailer {
  sendOtp(to: string, code: string, ttlMinutes: number): Promise<void>;
}

/** Set on the request by the guards. `legacy` is the shared OPERATOR_TOKEN, which has no user. */
export interface AuthContext {
  user: UserEntity;
  sessionId: string;
  client: Client;
}
