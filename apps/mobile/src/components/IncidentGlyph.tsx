import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import type { IncidentType } from '@vighnaway/contracts';

/**
 * Five custom incident glyphs on Lucide's 24-unit grid with a 2-unit stroke (DESIGN.md section 4):
 * flood (droplet over waves), closure (barrier), congestion (stacked cars), debris, accident.
 */
export function IncidentGlyph({ type, size = 20, color }: { type: IncidentType; size?: number; color: string }) {
  const p = { stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      {type === 'flood' ? (
        <>
          <Path d="M12 2.5c-2.6 3.4-4 5.4-4 7.4a4 4 0 0 0 8 0c0-2-1.4-4-4-7.4z" {...p} />
          <Path d="M2 17c1.7 0 1.7 1.2 3.3 1.2S7 17 8.7 17s1.7 1.2 3.3 1.2S13.7 17 15.3 17s1.7 1.2 3.4 1.2S20.3 17 22 17" {...p} />
          <Path d="M2 21c1.7 0 1.7 1.2 3.3 1.2S7 21 8.7 21s1.7 1.2 3.3 1.2S13.7 21 15.3 21s1.7 1.2 3.4 1.2S20.3 21 22 21" {...p} />
        </>
      ) : type === 'closure' ? (
        <>
          <Rect x="2" y="7" width="20" height="7" rx="1" {...p} />
          <Line x1="7" y1="7" x2="4" y2="14" {...p} />
          <Line x1="13" y1="7" x2="10" y2="14" {...p} />
          <Line x1="19" y1="7" x2="16" y2="14" {...p} />
          <Line x1="6" y1="14" x2="6" y2="21" {...p} />
          <Line x1="18" y1="14" x2="18" y2="21" {...p} />
        </>
      ) : type === 'congestion' ? (
        <>
          <Path d="M9 9V6.5A1.5 1.5 0 0 1 10.5 5h9A1.5 1.5 0 0 1 21 6.5V11a1 1 0 0 1-1 1h-2" {...p} />
          <Rect x="3" y="12" width="12" height="6" rx="1.5" {...p} />
          <Circle cx="6.5" cy="20" r="1.5" {...p} />
          <Circle cx="11.5" cy="20" r="1.5" {...p} />
        </>
      ) : type === 'debris' ? (
        <>
          <Path d="M3 20l3.5-7 4 2.5 3-6.5L21 20z" {...p} />
          <Circle cx="17.5" cy="6" r="2" {...p} />
          <Line x1="9" y1="20" x2="11" y2="16" {...p} />
        </>
      ) : (
        <>
          <Path d="M12 3 2 20.5h20z" {...p} />
          <Line x1="12" y1="9.5" x2="12" y2="14" {...p} />
          <Line x1="12" y1="17.5" x2="12.01" y2="17.5" {...p} />
        </>
      )}
    </Svg>
  );
}
