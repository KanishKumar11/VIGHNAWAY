import type { IncidentStatus } from '@vighnaway/contracts';
import { marker } from '@vighnaway/tokens';
import { themeVar } from '@/lib/theme';

/**
 * The ring language shared by markers and evidence chips: dashed = Unverified,
 * double = Corroborated, solid = Verified, grey with a strike = Resolved or Dismissed.
 * Drawn on a 36-unit box (the marker size).
 */
export function StatusRing({ status, size = marker.size }: { status: IncidentStatus; size?: number }) {
  const ring = marker.ring[status];
  // Ring colours by meaning, per theme: amber Unverified, orange Corroborated, red Verified.
  const color = status === 'corroborated' ? 'var(--vw-corroborated)' : themeVar(ring.color);
  const c = 18;
  const w = marker.ringWidth;
  return (
    <svg viewBox="0 0 36 36" width={size} height={size} aria-hidden className="pointer-events-none absolute inset-0">
      {ring.style === 'dashed' && <circle cx={c} cy={c} r={17 - w / 2} fill="none" stroke={color} strokeWidth={w + 0.5} strokeDasharray="4 3" />}
      {ring.style === 'double' && (
        <>
          <circle cx={c} cy={c} r={17 - w / 2} fill="none" stroke={color} strokeWidth={w} />
          <circle cx={c} cy={c} r={13.5 - w / 2} fill="none" stroke={color} strokeWidth={w * 0.75} />
        </>
      )}
      {ring.style === 'solid' && <circle cx={c} cy={c} r={17 - w / 2} fill="none" stroke={color} strokeWidth={w + 1} />}
      {ring.style === 'struck' && (
        <>
          <circle cx={c} cy={c} r={17 - w / 2} fill="none" stroke={color} strokeWidth={w} />
          <line x1={7} y1={29} x2={29} y2={7} stroke={color} strokeWidth={w} />
        </>
      )}
    </svg>
  );
}
