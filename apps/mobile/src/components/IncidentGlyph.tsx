import Svg, { Path } from 'react-native-svg';
import { incidentIcons, incidentIconStyle, type IncidentIconKey } from '@vighnaway/tokens';

/**
 * The incident pictograms (docs/DESIGN.md section 4): bold, two-tone, filled shapes from the shared
 * set in @vighnaway/tokens, drawn in the colour the surface passes. `road_clear` is the tick disc
 * used for "road clear" reports.
 */
export function IncidentGlyph({ type, size = 20, color }: { type: IncidentIconKey; size?: number; color: string }) {
  const { softOpacity, strokeWidth, roundStrokeWidth, viewBox } = incidentIconStyle;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${viewBox} ${viewBox}`} accessible={false}>
      {incidentIcons[type].map((layer, i) => {
        const opacity = layer.tone === 'soft' ? softOpacity : 1;
        return layer.paint === 'stroke' ? (
          <Path key={i} d={layer.d} fill="none" stroke={color} strokeOpacity={opacity} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <Path
            key={i}
            d={layer.d}
            fill={color}
            fillOpacity={opacity}
            fillRule="evenodd"
            {...(layer.round ? { stroke: color, strokeOpacity: opacity, strokeWidth: roundStrokeWidth, strokeLinejoin: 'round' as const } : null)}
          />
        );
      })}
    </Svg>
  );
}
