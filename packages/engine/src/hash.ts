/**
 * Canonical JSON (object keys sorted, recursively) hashed with two 32-bit FNV-1a variants.
 * Identical in Hermes, browsers and Node: no BigInt, no crypto, no locale-dependent formatting.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) return 'null';
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v)).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
}

function fnv1a32(s: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function hashString(s: string): string {
  const a = fnv1a32(s, 0x811c9dc5).toString(16).padStart(8, '0');
  const b = fnv1a32(s, 0x01000193 ^ 0x5bd1e995).toString(16).padStart(8, '0');
  return a + b;
}

export const hashValue = (v: unknown): string => hashString(canonicalJson(v));
