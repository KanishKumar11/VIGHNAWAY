import { useBottomSheetTimingConfigs } from '@gorhom/bottom-sheet';
import { Easing } from 'react-native-reanimated';
import { motion } from '@/theme';

/** Every sheet moves with a short ease-out slide to its stop: no spring, no bounce. */
export function useSheetAnimation() {
  return useBottomSheetTimingConfigs({ duration: motion.banner - 50, easing: Easing.out(Easing.cubic) });
}
