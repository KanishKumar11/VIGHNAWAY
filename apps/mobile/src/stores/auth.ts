import { create } from 'zustand';
import type { AuthSessionResponse, AuthUser } from '@vighnaway/contracts';
import { isStaffRole } from '@vighnaway/contracts';
import { api, ApiRequestError } from '@/lib/api';
import { KEYS, storage } from '@/lib/storage';
import { useConnection } from '@/stores/connection';
import { useSettings } from '@/stores/settings';

/**
 * The citizen's optional account. Signing in is never required to navigate or report; the session
 * only links reports to an account and shows a thank-you. It never feeds routing.
 *
 * The bearer token is kept in the MMKV storage wrapper (app-private storage), together with the
 * server it was issued by so it is never sent to a different server. It is never logged.
 */
interface Persisted {
  token: string;
  /** ISO 8601 UTC, from the server. */
  expiresAt: string;
  user: AuthUser;
  /** API base URL that issued the token. */
  server: string;
}

interface AuthState {
  token: string | null;
  expiresAt: string | null;
  user: AuthUser | null;
  server: string | null;
  setSession: (s: AuthSessionResponse) => void;
  /** The name changed on the server: keep the new one on this phone. */
  setUser: (user: AuthUser) => void;
  /** Drop the session on this phone only. */
  clearLocal: () => void;
  /** Revalidate with GET /auth/me. Offline or a network failure keeps the cached user. */
  hydrate: () => Promise<void>;
  /** Clear locally first, then tell the server (best effort). */
  signOut: () => Promise<void>;
}

const apiUrl = () => useSettings.getState().apiUrl;

export const isExpired = (expiresAt: string | null | undefined, nowMs = Date.now()): boolean => {
  if (!expiresAt) return true;
  const at = Date.parse(expiresAt);
  return !Number.isFinite(at) || at <= nowMs;
};

function load(): Persisted | null {
  const p = storage.getJSON<Partial<Persisted>>(KEYS.auth);
  if (!p || typeof p.token !== 'string' || !p.token || typeof p.expiresAt !== 'string' || !p.user || typeof p.user.id !== 'string' || typeof p.server !== 'string') {
    if (p) storage.remove(KEYS.auth);
    return null;
  }
  if (isExpired(p.expiresAt)) {
    storage.remove(KEYS.auth);
    return null;
  }
  return p as Persisted;
}

const initial = load();
const empty = { token: null, expiresAt: null, user: null, server: null } as const;

export const useAuth = create<AuthState>()((set, get) => ({
  ...(initial ?? empty),
  setSession: (s) => {
    const server = apiUrl();
    storage.setJSON(KEYS.auth, { token: s.token, expiresAt: s.expiresAt, user: s.user, server } satisfies Persisted);
    set({ token: s.token, expiresAt: s.expiresAt, user: s.user, server });
  },
  setUser: (user) => {
    const { token, expiresAt, server } = get();
    if (!token || !expiresAt || !server) return;
    storage.setJSON(KEYS.auth, { token, expiresAt, user, server } satisfies Persisted);
    set({ user });
  },
  clearLocal: () => {
    storage.remove(KEYS.auth);
    set({ ...empty });
  },
  // Concurrent calls are harmless: each one checks the token is still the same before it writes.
  hydrate: async () => {
    const { token, expiresAt, server } = get();
    if (!token) return;
    // Expired, or issued by another server than the one in Settings: the session is not usable here.
    if (isExpired(expiresAt) || server !== apiUrl()) {
      get().clearLocal();
      return;
    }
    if (useConnection.getState().net === 'offline') return;
    try {
      const me = await api.authMe(server, token);
      if (get().token !== token) return; // signed out or replaced while waiting
      if (isStaffRole(me.user.role)) {
        get().clearLocal(); // the phone app is for citizens
        return;
      }
      const next: Persisted = { token, expiresAt: expiresAt as string, user: me.user, server: server as string };
      storage.setJSON(KEYS.auth, next);
      set({ user: me.user });
    } catch (e) {
      // Only a 401 means the session is gone. A network failure or a 5xx never signs anyone out.
      if (e instanceof ApiRequestError && e.status === 401 && get().token === token) get().clearLocal();
    }
  },
  signOut: async () => {
    const { token, server } = get();
    get().clearLocal();
    // Signing out on purpose brings the launch sign-in screen back (it can still be skipped).
    useSettings.getState().setSignInSkipped(false);
    if (!token) return;
    try {
      await api.authLogout(server ?? apiUrl(), token);
    } catch {
      // Best effort: the session is already gone on this phone, and it expires on the server.
    }
  },
}));

/** True while a usable session is held on this phone (not expired, issued by the current server). */
export const selectSignedIn = (s: AuthState): boolean => !!s.token && !!s.user && !isExpired(s.expiresAt) && s.server === apiUrl();

/** The bearer token to send with a report, or null to report anonymously. */
export function authToken(): string | null {
  const s = useAuth.getState();
  return selectSignedIn(s) ? s.token : null;
}

/** Revalidate the session at start, whenever the network returns and when the server address changes. */
export function startAuth(): () => void {
  void useAuth.getState().hydrate();
  const offNet = useConnection.subscribe((s, prev) => {
    if (s.net === 'online' && prev.net !== 'online') void useAuth.getState().hydrate();
  });
  const offServer = useSettings.subscribe((s, prev) => {
    if (s.apiUrl !== prev.apiUrl) void useAuth.getState().hydrate();
  });
  return () => {
    offNet();
    offServer();
  };
}
