import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useColors } from '@/theme';

const ROUTE = 'M20 80 L29 71 C36 64 27 42 42 33 C53 26 61 35 71 29 L80 20';

/** VIGHNAWAY mark: a route line bending around an obstacle, in the recommended-route teal. */
export function Mark({ size = 96 }: { size?: number }) {
  const tc = useColors();
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessible={false}>
      <Path d="M20 80 L80 20" stroke={tc.inkOnShellMuted} strokeWidth={2} strokeDasharray={[3, 5]} strokeLinecap="round" opacity={0.6} fill="none" />
      <Path d={ROUTE} stroke={tc.routeRecommendedCasing} strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d={ROUTE} stroke={tc.routeRecommended} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Rect x={45} y={45} width={14} height={14} rx={2.5} transform="rotate(45 52 52)" fill={tc.shell} stroke={tc.inkOnShellMuted} strokeWidth={4} />
      <Circle cx={20} cy={80} r={6.5} fill={tc.routeRecommended} />
      <Circle cx={80} cy={20} r={6.5} fill={tc.shell} stroke={tc.routeRecommended} strokeWidth={4} />
    </Svg>
  );
}
