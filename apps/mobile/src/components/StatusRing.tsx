import Svg, { Circle, Line } from 'react-native-svg';
import type { IncidentStatus } from '@vighnaway/contracts';
import { ringStyle, useColors } from '@/theme';

/**
 * Ring language shared by markers and chips: dashed = Unverified, double = Corroborated,
 * solid = Verified, grey with a strike = Resolved or Dismissed.
 */
export function StatusRing({ status, size = 14, strokeWidth = 2 }: { status: IncidentStatus; size?: number; strokeWidth?: number }) {
  const ring = ringStyle(useColors(), status);
  const r = size / 2 - strokeWidth;
  const c = size / 2;
  return (
    <Svg width={size} height={size} accessible={false}>
      {ring.style === 'dashed' ? (
        <Circle cx={c} cy={c} r={r} stroke={ring.color} strokeWidth={strokeWidth} strokeDasharray={[size / 6, size / 8]} fill="none" />
      ) : ring.style === 'double' ? (
        <>
          <Circle cx={c} cy={c} r={r} stroke={ring.color} strokeWidth={strokeWidth * 0.75} fill="none" />
          <Circle cx={c} cy={c} r={Math.max(1, r - strokeWidth * 1.5)} stroke={ring.color} strokeWidth={strokeWidth * 0.75} fill="none" />
        </>
      ) : ring.style === 'solid' ? (
        <Circle cx={c} cy={c} r={r} stroke={ring.color} strokeWidth={strokeWidth * 1.25} fill="none" />
      ) : (
        <>
          <Circle cx={c} cy={c} r={r} stroke={ring.color} strokeWidth={strokeWidth} fill="none" />
          <Line x1={strokeWidth} y1={size - strokeWidth} x2={size - strokeWidth} y2={strokeWidth} stroke={ring.color} strokeWidth={strokeWidth} />
        </>
      )}
    </Svg>
  );
}
