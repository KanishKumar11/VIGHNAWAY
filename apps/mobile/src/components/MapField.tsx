import { memo } from 'react';
import Svg, { G, Line, Rect } from 'react-native-svg';
import { spacing, useColors } from '@/theme';

/** Grid pitch on the navy field (4 × the 8-pt unit). */
export const GRID = spacing.xl;

/**
 * The map field: the theme's neutral map ground (`shellDeep`) with a faint hairline grid. Flat
 * and neutral so routes and hazards carry the colour (DESIGN_VISION 4.4). Use inside an <Svg>.
 */
export const MapFieldLayer = memo(function MapFieldLayer({ width, height }: { width: number; height: number; cx?: number; cy?: number }) {
  const tc = useColors();
  const ox = ((width / 2) % GRID) - GRID;
  const oy = ((height / 2) % GRID) - GRID;
  const cols = Math.ceil(width / GRID) + 2;
  const rows = Math.ceil(height / GRID) + 2;
  return (
    <G>
      <Rect x={0} y={0} width={width} height={height} fill={tc.shellDeep} />
      {Array.from({ length: cols }, (_, i) => (
        <Line key={`v${i}`} x1={ox + i * GRID} y1={0} x2={ox + i * GRID} y2={height} stroke={tc.shellHairline} strokeWidth={1} />
      ))}
      {Array.from({ length: rows }, (_, i) => (
        <Line key={`h${i}`} x1={0} y1={oy + i * GRID} x2={width} y2={oy + i * GRID} stroke={tc.shellHairline} strokeWidth={1} />
      ))}
    </G>
  );
});

/** Standalone field (first run, location tile). */
export function MapField({ width, height, cx, cy }: { width: number; height: number; cx?: number; cy?: number }) {
  return (
    <Svg width={width} height={height} accessible={false} pointerEvents="none">
      <MapFieldLayer width={width} height={height} cx={cx} cy={cy} />
    </Svg>
  );
}
