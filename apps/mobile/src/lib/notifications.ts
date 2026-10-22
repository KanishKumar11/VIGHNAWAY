import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';
import { themes } from '@/theme';

// trigger: null delivers immediately on the default channel, so the route-change channel is 'default'.
const CHANNEL_ID = 'default';
let configured = false;

/** Local notifications only: shown when the recommendation changes while the app is backgrounded. */
export async function configureNotifications(): Promise<void> {
  if (configured) return;
  configured = true;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Route changes',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 200, 120, 200],
        lightColor: themes.light.accent,
      });
    }
  } catch (e) {
    console.warn('Notifications unavailable', e);
  }
}

/** Ask once, after the first route is shown (never at launch). */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    const res = await Notifications.requestPermissionsAsync();
    return res.granted;
  } catch {
    return false;
  }
}

/** Schedules an immediate local notification (trigger null) only when the app is not active. */
export async function notifyIfBackgrounded(title: string, body: string): Promise<void> {
  if (AppState.currentState === 'active') return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: null,
    });
  } catch (e) {
    console.warn('Could not schedule notification', e);
  }
}
