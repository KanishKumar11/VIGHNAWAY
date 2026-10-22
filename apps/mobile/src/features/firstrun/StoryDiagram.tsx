import { View } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import type { IncidentStatus } from '@vighnaway/contracts';
import { IncidentGlyph } from '@/components/IncidentGlyph';
import { StatusRing } from '@/components/StatusRing';
import { routeStyles, useColors } from '@/theme';

const W = 300;
const H = 170;
const ORIGIN = { x: 26, y: 132 };
const DEST = { x: 274, y: 42 };
const FLOOD = { x: 150, y: 132 };
// The usual way runs straight through the underpass; the other climbs to the flyover.
const USUAL = `M${ORIGIN.x},${ORIGIN.y} H${FLOOD.x + 20} L${DEST.x},${DEST.y}`;
const OTHER = `M${ORIGIN.x},${ORIGIN.y} H70 L104,56 H220 L${DEST.x},${DEST.y}`;
const SIDE = 'M8,90 H292 M200,8 V162';

/**
 * First-run story (DESIGN_VISION appendix A): a still diagram per step, in the map's own language,
 * so the story reads with motion off. 1: a flood report on the usual road (dashed ring, Unverified).
 * 2: a second device (double ring, Corroborated). 3: the usual road interrupted, the other way
 * recommended in teal.
 */
export function StoryDiagram({ step, width }: { step: 1 | 2 | 3; width: number }) {
  const tc = useColors();
  const scale = width / W;
  const height = H * scale;
  const status: IncidentStatus = step === 1 ? 'unverified' : 'corroborated';
  const ring = 34;
  const rec = routeStyles.recommended.width;
  return (
    <View style={{ width, height }} accessible={false} importantForAccessibility="no-hide-descendants">
      <Svg width={width} height={height} viewBox={`0 0 ${W} ${H}`}>
        <Path d={SIDE} stroke={tc.roadMinor} strokeWidth={5} fill="none" strokeLinecap="round" />
        <Path d={OTHER} stroke={tc.roadMajor} strokeWidth={8} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        <Path d={USUAL} stroke={tc.roadMajor} strokeWidth={8} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        {/* Restrained flood contour: dotted, no ripple. */}
        <Circle cx={FLOOD.x} cy={FLOOD.y} r={30} fill={tc.floodProne} stroke={tc.floodProneSolid} strokeWidth={1} strokeDasharray={[2, 4]} />
        {step < 3 ? (
          <G>
            <Path d={USUAL} stroke={tc.routeRecommendedCasing} strokeWidth={rec + 3} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            <Path d={USUAL} stroke={tc.routeRecommended} strokeWidth={rec} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          </G>
        ) : (
          <G>
            {/* The usual road: muted, dashed, and interrupted at the flood. */}
            <Path d={USUAL} stroke={tc.routeMuted} strokeWidth={routeStyles.blocked.width} fill="none" strokeDasharray={[6, 6]} strokeLinejoin="round" />
            <Path d={`M${FLOOD.x - 54},${FLOOD.y} H${FLOOD.x - 20}`} stroke={tc.danger} strokeWidth={routeStyles.blocked.width} strokeDasharray={[5, 4]} />
            <Path d={OTHER} stroke={tc.routeRecommendedCasing} strokeWidth={rec + 3} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            <Path d={OTHER} stroke={tc.routeRecommended} strokeWidth={rec} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          </G>
        )}
        {step === 2 ? (
          <G>
            {/* Two devices: two dots beside the marker. */}
            <Circle cx={FLOOD.x - 30} cy={FLOOD.y - 30} r={4} fill={tc.ink} />
            <Circle cx={FLOOD.x - 18} cy={FLOOD.y - 30} r={4} fill={tc.ink} />
          </G>
        ) : null}
        <Circle cx={ORIGIN.x} cy={ORIGIN.y} r={7} fill={tc.panel} stroke={tc.ink} strokeWidth={3} />
        <Rect x={DEST.x - 7} y={DEST.y - 7} width={14} height={14} rx={2} fill={tc.ink} />
      </Svg>
      <View
        style={{
          position: 'absolute',
          left: FLOOD.x * scale - (ring * scale) / 2,
          top: FLOOD.y * scale - (ring * scale) / 2,
          width: ring * scale,
          height: ring * scale,
          borderRadius: (ring * scale) / 2,
          backgroundColor: tc.panel,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View style={{ position: 'absolute', left: 0, top: 0 }}>
          <StatusRing status={status} size={ring * scale} strokeWidth={2.5} />
        </View>
        <IncidentGlyph type="flood" size={16 * scale} color={tc.ink} />
      </View>
    </View>
  );
}
