import { isStaffRole, type Role } from '@vighnaway/contracts';
import { useOperator } from '@/stores/operator';
import { activeSession, useSession } from '@/stores/session';

/**
 * The one place that decides which credential an operator action sends as Authorization: Bearer.
 *  1. A signed-in operator or admin session.
 *  2. Else the legacy shared operator token typed into the "Demo access" dialog (the scripted demo).
 *  3. Else nothing. A citizen session is never an operator credential.
 * The server enforces roles either way; this only picks what to send.
 */
export type Credential = { kind: 'session' | 'token'; token: string };

/** Pure form, so React hooks and plain code decide identically. */
export function resolveCredential(
  session: { token: string | null; role: Role | null },
  legacyToken: string | null,
): Credential | null {
  if (session.token && session.role && isStaffRole(session.role)) return { kind: 'session', token: session.token };
  if (legacyToken) return { kind: 'token', token: legacyToken };
  return null;
}

export function getOperatorCredential(): Credential | null {
  const s = activeSession();
  return resolveCredential({ token: s?.token ?? null, role: s?.user.role ?? null }, useOperator.getState().token);
}

/** For rendering: which credential would be sent, or null. */
export function useOperatorAccess(): Credential['kind'] | null {
  const token = useSession((s) => s.token);
  const role = useSession((s) => s.user?.role ?? null);
  const legacy = useOperator((s) => s.token);
  return resolveCredential({ token, role }, legacy)?.kind ?? null;
}

/** The server rejected this credential (401): forget exactly that one. */
export function dropCredential(c: Credential): void {
  if (c.kind === 'session') useSession.getState().clear();
  else useOperator.getState().setToken(null);
}
