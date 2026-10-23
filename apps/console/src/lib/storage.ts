/** Browser storage wrappers that never throw (private mode, blocked storage, SSR). */
export function readStorage(kind: 'local' | 'session', key: string): string | null {
  try {
    if (typeof window === 'undefined') return null;
    return (kind === 'local' ? window.localStorage : window.sessionStorage).getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(kind: 'local' | 'session', key: string, value: string | null): void {
  try {
    if (typeof window === 'undefined') return;
    const s = kind === 'local' ? window.localStorage : window.sessionStorage;
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

const TOKEN_KEY = 'vighnaway.operatorToken';
const DEVICE_KEY = 'vighnaway.deviceId';

/** Demo-grade: sessionStorage, cleared when the tab closes. Never in NEXT_PUBLIC_*. */
export const loadOperatorToken = (): string | null => readStorage('session', TOKEN_KEY);
export const saveOperatorToken = (token: string | null): void => writeStorage('session', TOKEN_KEY, token);

const SESSION_KEY = 'vighnaway.session';
/** The signed-in session as a JSON string (sessionStorage: cleared when the tab closes). */
export const loadSessionRaw = (): string | null => readStorage('session', SESSION_KEY);
export const saveSessionRaw = (raw: string | null): void => writeStorage('session', SESSION_KEY, raw);

/** Random id for corroboration grouping. Not authoritative; the server hashes it. */
export function generateDeviceId(random: (n: number) => Uint8Array = defaultRandom): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = random(20);
  let out = 'web-';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

function defaultRandom(n: number): Uint8Array {
  const a = new Uint8Array(n);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(a);
  else for (let i = 0; i < n; i++) a[i] = Math.floor(Math.random() * 256);
  return a;
}

export function getDeviceId(): string {
  const existing = readStorage('local', DEVICE_KEY);
  if (existing && /^[A-Za-z0-9_-]{8,64}$/.test(existing)) return existing;
  const id = generateDeviceId();
  writeStorage('local', DEVICE_KEY, id);
  return id;
}

/**
 * Whether the optional name has been asked for on this email in this browser. It is only used when a sign-in creates
 * the account, so it is asked at most once per email, not at every sign-in. Nothing here is secret.
 */
const nameKey = (email: string) => `vw.nameAsked.${email.trim().toLowerCase()}`;
export function nameAlreadyAsked(email: string): boolean {
  try {
    return localStorage.getItem(nameKey(email)) === '1';
  } catch {
    return false;
  }
}
export function markNameAsked(email: string): void {
  try {
    localStorage.setItem(nameKey(email), '1');
  } catch {
    /* private mode: it will simply be asked again */
  }
}
