import { create } from 'zustand';
import { AuthUserSchema, type AuthSessionResponse, type AuthUser } from '@vighnaway/contracts';
import { api, ApiError } from '@/lib/api';
import { loadSessionRaw, saveSessionRaw } from '@/lib/storage';

/**
 * The signed-in account. Kept in sessionStorage (cleared when the tab closes), validated with
 * GET /auth/me on load, cleared on a 401 or once expiresAt passes. The server is the real
 * enforcement of every role; this store only decides what the console shows and which credential
 * is sent. An account never feeds routing.
 */
export interface SessionStore {
  token: string | null;
  /** ISO 8601 UTC, as the server sent it. */
  expiresAt: string | null;
  user: AuthUser | null;
  /** True once the stored session (if any) has been read. UI waits for this before deciding. */
  hydrated: boolean;
  /** Bumped after a report is sent so the thank-you line refetches. */
  statsNonce: number;
  hydrate(): Promise<void>;
  setSession(resp: AuthSessionResponse): void;
  /** Re-reads the account (role changes). Clears the session on a 401. */
  revalidate(): Promise<void>;
  signOut(): Promise<void>;
  clear(): void;
  bumpStats(): void;
}

const MAX_TIMER_MS = 2 ** 31 - 1;
let expiryTimer: ReturnType<typeof setTimeout> | null = null;

const expiresMs = (iso: string | null): number => {
  const ms = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(ms) ? ms : 0;
};

function disarm() {
  if (expiryTimer) clearTimeout(expiryTimer);
  expiryTimer = null;
}

function arm(expiresAt: string | null, onExpire: () => void) {
  disarm();
  if (!expiresAt || typeof setTimeout === 'undefined') return;
  const wait = expiresMs(expiresAt) - Date.now();
  expiryTimer = setTimeout(onExpire, Math.min(Math.max(wait, 0), MAX_TIMER_MS));
}

const persist = (token: string, expiresAt: string, user: AuthUser) => saveSessionRaw(JSON.stringify({ token, expiresAt, user }));

function readStored(): { token: string; expiresAt: string; user: AuthUser } | null {
  const raw = loadSessionRaw();
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { token?: unknown; expiresAt?: unknown; user?: unknown };
    const user = AuthUserSchema.safeParse(v.user);
    if (typeof v.token !== 'string' || !v.token || typeof v.expiresAt !== 'string' || !user.success) return null;
    return { token: v.token, expiresAt: v.expiresAt, user: user.data };
  } catch {
    return null;
  }
}

export const useSession = create<SessionStore>()((set, get) => ({
  token: null,
  expiresAt: null,
  user: null,
  hydrated: false,
  statsNonce: 0,

  async hydrate() {
    if (get().hydrated) return;
    const stored = readStored();
    if (!stored || expiresMs(stored.expiresAt) <= Date.now()) {
      saveSessionRaw(null);
      set({ hydrated: true });
      return;
    }
    set({ ...stored, hydrated: true });
    arm(stored.expiresAt, () => get().clear());
    await get().revalidate();
  },

  setSession(resp) {
    persist(resp.token, resp.expiresAt, resp.user);
    set({ token: resp.token, expiresAt: resp.expiresAt, user: resp.user, hydrated: true });
    arm(resp.expiresAt, () => get().clear());
  },

  async revalidate() {
    const { token, expiresAt } = get();
    if (!token || !expiresAt) return;
    try {
      const me = await api.me(token);
      // Ignore a late answer if the session changed while the request ran.
      if (get().token !== token) return;
      persist(token, expiresAt, me.user);
      set({ user: me.user });
    } catch (e) {
      // A stale token must not break anything: drop it. A network error keeps the session.
      if (e instanceof ApiError && (e.code === 'UNAUTHORIZED' || e.status === 401) && get().token === token) get().clear();
    }
  },

  async signOut() {
    const { token } = get();
    get().clear();
    if (!token) return;
    try {
      await api.logout(token);
    } catch {
      /* the local session is already gone; a failed logout changes nothing for the person */
    }
  },

  clear() {
    disarm();
    saveSessionRaw(null);
    set({ token: null, expiresAt: null, user: null });
  },

  bumpStats() {
    set((s) => ({ statsNonce: s.statsNonce + 1 }));
  },
}));

/** The session if it exists and has not expired; an expired one is cleared on the spot. */
export function activeSession(): { token: string; user: AuthUser } | null {
  const { token, user, expiresAt } = useSession.getState();
  if (!token || !user) return null;
  if (expiresMs(expiresAt) <= Date.now()) {
    useSession.getState().clear();
    return null;
  }
  return { token, user };
}
