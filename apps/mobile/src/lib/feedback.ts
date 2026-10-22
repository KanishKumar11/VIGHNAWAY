import * as Haptics from 'expo-haptics';
import { AccessibilityInfo } from 'react-native';

/** Haptics never throw into app logic (some devices have no vibrator). */
const safe = (p: () => Promise<void>) => {
  try {
    p().catch(() => undefined);
  } catch {
    // ignore
  }
};

export const haptic = {
  warning: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  light: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  selection: () => safe(() => Haptics.selectionAsync()),
};

/** Polite announcement: queued behind whatever the screen reader is saying (iOS), never interrupting. */
export function announce(message: string): void {
  try {
    if (AccessibilityInfo.announceForAccessibilityWithOptions) AccessibilityInfo.announceForAccessibilityWithOptions(message, { queue: true });
    else AccessibilityInfo.announceForAccessibility(message);
  } catch {
    // ignore
  }
}
