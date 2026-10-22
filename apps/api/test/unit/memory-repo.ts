import type { MyStatsResponse } from '@vighnaway/contracts';
import type { AuthRepo, Mailer, OtpEntity, SessionEntity, UserEntity } from '../../src/auth/auth.types';

/** In-memory AuthRepo with the same atomic semantics the SQL one provides. */
export class MemoryAuthRepo implements AuthRepo {
  users = new Map<string, UserEntity>();
  otps: OtpEntity[] = [];
  sessions = new Map<string, SessionEntity>();
  stats: MyStatsResponse = { reports: 0, inVerifiedIncidents: 0 };

  async findUserByEmail(email: string) {
    return [...this.users.values()].find((u) => u.email === email) ?? null;
  }
  async findUserById(id: string) {
    return this.users.get(id) ?? null;
  }
  async createUser(user: UserEntity) {
    const existing = await this.findUserByEmail(user.email);
    if (existing) return existing;
    this.users.set(user.id, { ...user });
    return user;
  }
  async updateUser(id: string, patch: Partial<Pick<UserEntity, 'role' | 'displayName' | 'disabled' | 'lastLoginAt'>>) {
    const u = this.users.get(id);
    if (!u) return null;
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) (u as unknown as Record<string, unknown>)[k] = v;
    return { ...u };
  }
  async listUsers(limit: number) {
    return [...this.users.values()].slice(0, limit);
  }
  async countActiveAdmins() {
    return [...this.users.values()].filter((u) => u.role === 'admin' && !u.disabled).length;
  }
  async insertOtp(otp: OtpEntity) {
    this.otps.push({ ...otp });
  }
  async latestOtp(email: string) {
    const mine = this.otps.filter((o) => o.email === email);
    return mine.length ? { ...mine.reduce((a, b) => (b.createdAt >= a.createdAt ? b : a)) } : null;
  }
  async countOtps(f: { email?: string; ipHash?: string; since: Date }) {
    return this.otps.filter((o) => o.createdAt >= f.since && (!f.email || o.email === f.email) && (!f.ipHash || o.ipHash === f.ipHash)).length;
  }
  async incrementOtpAttempts(id: string) {
    const o = this.otps.find((x) => x.id === id);
    if (!o) return Number.MAX_SAFE_INTEGER;
    return ++o.attempts;
  }
  async consumeOtp(id: string, at: Date) {
    const o = this.otps.find((x) => x.id === id);
    if (!o || o.consumedAt) return false;
    o.consumedAt = at;
    return true;
  }
  async insertSession(s: SessionEntity) {
    this.sessions.set(s.id, { ...s });
  }
  async findSessionByTokenHash(h: string) {
    return [...this.sessions.values()].find((s) => s.tokenHash === h) ?? null;
  }
  async revokeSession(id: string, at: Date) {
    const s = this.sessions.get(id);
    if (s && !s.revokedAt) s.revokedAt = at;
  }
  async revokeUserSessions(userId: string, at: Date) {
    for (const s of this.sessions.values()) if (s.userId === userId && !s.revokedAt) s.revokedAt = at;
  }
  async reportStats() {
    return this.stats;
  }
}

export class CaptureMailer implements Mailer {
  sent: Array<{ to: string; code: string; ttlMinutes: number }> = [];
  fail = false;
  async sendOtp(to: string, code: string, ttlMinutes: number) {
    if (this.fail) throw new Error('smtp down');
    this.sent.push({ to, code, ttlMinutes });
  }
  last(): { to: string; code: string } {
    return this.sent[this.sent.length - 1]!;
  }
}
