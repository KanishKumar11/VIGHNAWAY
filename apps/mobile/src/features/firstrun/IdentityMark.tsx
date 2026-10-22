import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { identity } from '@vighnaway/tokens';

const ROUTE = 'M20 80 L29 71 C36 64 27 42 42 33 C53 26 61 35 71 29 L80 20';

/** The VIGHNAWAY mark in the Monsoon Signal colours: a signal-lime line bending around an obstacle. */
export function IdentityMark({ size = 32 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessible={false}>
      <Path d="M20 80 L80 20" stroke={identity.textSubtle} strokeWidth={2} strokeDasharray={[3, 5]} strokeLinecap="round" opacity={0.6} fill="none" />
      <Path d={ROUTE} stroke={identity.skyTop} strokeWidth={13} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d={ROUTE} stroke={identity.lime} strokeWidth={7.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Rect x={45} y={45} width={14} height={14} rx={2.5} transform="rotate(45 52 52)" fill={identity.skyMid} stroke={identity.marigold} strokeWidth={4} />
      <Circle cx={20} cy={80} r={6.5} fill={identity.lime} />
      <Circle cx={80} cy={20} r={6.5} fill={identity.skyMid} stroke={identity.lime} strokeWidth={4} />
    </Svg>
  );
}
