import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { useColors } from '@/theme';

export type IllustrationKind = 'noIncidents' | 'offline' | 'noViableRoute' | 'reportSent';

/** Four original two-colour line illustrations in the Lucide stroke style (DESIGN.md section 8). */
export function Illustration({ kind, size = 72, accent }: { kind: IllustrationKind; size?: number; accent?: string }) {
  const tc = useColors();
  const a = { stroke: tc.inkMuted, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  // Two-colour line art: muted lines with one teal accent (the second colour can be a state colour).
  const b = { ...a, stroke: accent ?? tc.brand };
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" accessible={false}>
      {kind === 'noIncidents' ? (
        <>
          <Path d="M8 42 L18 6" {...a} />
          <Path d="M40 42 L30 6" {...a} />
          <Line x1="24" y1="10" x2="24" y2="14" {...a} />
          <Line x1="24" y1="20" x2="24" y2="25" {...a} />
          <Circle cx="24" cy="36" r="6" {...b} />
          <Path d="M21.5 36l2 2 3.5-4" {...b} />
        </>
      ) : kind === 'offline' ? (
        <>
          <Path d="M14 34h20a7 7 0 0 0 1-13.9A10 10 0 0 0 16 18a8 8 0 0 0-2 16z" {...a} />
          <Line x1="8" y1="8" x2="40" y2="40" {...b} />
        </>
      ) : kind === 'noViableRoute' ? (
        <>
          <Path d="M6 40 C14 30 18 26 24 24" {...a} />
          <Path d="M42 8 C34 18 30 22 24 24" {...a} strokeDasharray={[3, 4]} />
          <Rect x="16" y="18" width="16" height="6" rx="1" {...b} />
          <Line x1="19" y1="24" x2="19" y2="30" {...b} />
          <Line x1="29" y1="24" x2="29" y2="30" {...b} />
        </>
      ) : (
        <>
          <Path d="M24 44s-12-12.5-12-22a12 12 0 0 1 24 0c0 9.5-12 22-12 22z" {...a} />
          <Path d="M19 22l3.5 3.5L29 19" {...b} />
        </>
      )}
    </Svg>
  );
}
