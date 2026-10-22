import { Inject, Injectable } from '@nestjs/common';
import type { Client, MyStatsResponse, Role } from '@vighnaway/contracts';
import { and, asc, count, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { DB } from '../db/db.module';
import { authOtps, authSessions, incidentReports, incidents, users } from '../db/schema';
import type { AuthRepo, OtpEntity, SessionEntity, UserEntity } from './auth.types';

type UserRow = typeof users.$inferSelect;
type OtpRow = typeof authOtps.$inferSelect;
type SessionRow = typeof authSessions.$inferSelect;

const toUser = (r: UserRow): UserEntity => ({ ...r, role: r.role as Role });
const toOtp = (r: OtpRow): OtpEntity => ({ ...r, client: r.client as Client });
const toSession = (r: SessionRow): SessionEntity => ({ ...r, client: r.client as Client });

@Injectable()
export class DrizzleAuthRepo implements AuthRepo {
  constructor(@Inject(DB) private readonly db: Db) {}

  async findUserByEmail(email: string): Promise<UserEntity | null> {
    const [r] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return r ? toUser(r) : null;
  }

  async findUserById(id: string): Promise<UserEntity | null> {
    const [r] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return r ? toUser(r) : null;
  }

  async createUser(user: UserEntity): Promise<UserEntity> {
    // A second sign-in racing the first one lands on the same row instead of failing.
    await this.db.insert(users).values(user).onConflictDoNothing({ target: users.email });
    const found = await this.findUserByEmail(user.email);
    return found ?? user;
  }

  async updateUser(id: string, patch: Partial<Pick<UserEntity, 'role' | 'displayName' | 'disabled' | 'lastLoginAt'>>): Promise<UserEntity | null> {
    const set = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    if (Object.keys(set).length === 0) return this.findUserById(id);
    const [r] = await this.db.update(users).set(set).where(eq(users.id, id)).returning();
    return r ? toUser(r) : null;
  }

  async listUsers(limit: number): Promise<UserEntity[]> {
    const rows = await this.db.select().from(users).orderBy(asc(users.role), asc(users.email)).limit(limit);
    return rows.map(toUser);
  }

  async countActiveAdmins(): Promise<number> {
    const [r] = await this.db
      .select({ n: count() })
      .from(users)
      .where(and(eq(users.role, 'admin'), eq(users.disabled, false)));
    return Number(r?.n ?? 0);
  }

  async insertOtp(otp: OtpEntity): Promise<void> {
    await this.db.insert(authOtps).values(otp);
  }

  async latestOtp(email: string): Promise<OtpEntity | null> {
    const [r] = await this.db.select().from(authOtps).where(eq(authOtps.email, email)).orderBy(desc(authOtps.createdAt)).limit(1);
    return r ? toOtp(r) : null;
  }

  async countOtps(filter: { email?: string; ipHash?: string; since: Date }): Promise<number> {
    const conds = [gte(authOtps.createdAt, filter.since)];
    if (filter.email) conds.push(eq(authOtps.email, filter.email));
    if (filter.ipHash) conds.push(eq(authOtps.ipHash, filter.ipHash));
    const [r] = await this.db.select({ n: count() }).from(authOtps).where(and(...conds));
    return Number(r?.n ?? 0);
  }

  async incrementOtpAttempts(id: string): Promise<number> {
    const [r] = await this.db
      .update(authOtps)
      .set({ attempts: sql`${authOtps.attempts} + 1` })
      .where(eq(authOtps.id, id))
      .returning({ attempts: authOtps.attempts });
    return r?.attempts ?? Number.MAX_SAFE_INTEGER;
  }

  async consumeOtp(id: string, at: Date): Promise<boolean> {
    const rows = await this.db
      .update(authOtps)
      .set({ consumedAt: at })
      .where(and(eq(authOtps.id, id), isNull(authOtps.consumedAt)))
      .returning({ id: authOtps.id });
    return rows.length === 1;
  }

  async insertSession(session: SessionEntity): Promise<void> {
    await this.db.insert(authSessions).values(session);
  }

  async findSessionByTokenHash(tokenHash: string): Promise<SessionEntity | null> {
    const [r] = await this.db.select().from(authSessions).where(eq(authSessions.tokenHash, tokenHash)).limit(1);
    return r ? toSession(r) : null;
  }

  async revokeSession(id: string, at: Date): Promise<void> {
    await this.db.update(authSessions).set({ revokedAt: at }).where(and(eq(authSessions.id, id), isNull(authSessions.revokedAt)));
  }

  async revokeUserSessions(userId: string, at: Date): Promise<void> {
    await this.db.update(authSessions).set({ revokedAt: at }).where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt)));
  }

  async reportStats(userId: string): Promise<MyStatsResponse> {
    const [total] = await this.db.select({ n: count() }).from(incidentReports).where(eq(incidentReports.userId, userId));
    const [verified] = await this.db
      .select({ n: count() })
      .from(incidentReports)
      .innerJoin(incidents, eq(incidents.id, incidentReports.incidentId))
      .where(and(eq(incidentReports.userId, userId), sql`${incidents.verifiedAtS} is not null`));
    return { reports: Number(total?.n ?? 0), inVerifiedIncidents: Number(verified?.n ?? 0) };
  }
}
