import LottieView from 'lottie-react-native';
import { memo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { useReduceMotion } from '@/lib/motion';

// Shared animations generated from tokens (pnpm --filter @vighnaway/tokens lottie).
const sources = {
  scan: require('@vighnaway/tokens/lottie/scan.json'),
  success: require('@vighnaway/tokens/lottie/success.json'),
} as const;

/**
 * The shared Lottie animations: `scan` loops while routes are evaluated, `success` plays once
 * when a report is sent. With reduce motion the final frame is shown and nothing plays.
 */
export const Lottie = memo(function Lottie({
  name,
  size,
  loop,
  onFinish,
  style,
}: {
  name: keyof typeof sources;
  size: number;
  loop?: boolean;
  onFinish?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const reduce = useReduceMotion();
  return (
    <LottieView
      source={sources[name]}
      autoPlay={!reduce}
      loop={!reduce && !!loop}
      progress={reduce ? 1 : undefined}
      onAnimationFinish={onFinish ? () => onFinish() : undefined}
      style={[{ width: size, height: size }, style]}
    />
  );
});
