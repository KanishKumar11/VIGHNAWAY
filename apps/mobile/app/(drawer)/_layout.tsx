import { Redirect } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import { useWindowDimensions } from 'react-native';
import { DrawerContent } from '@/components/DrawerContent';
import { t } from '@/i18n/en';
import { useSettings } from '@/stores/settings';
import { layout, useColors } from '@/theme';

export default function DrawerLayout() {
  const tc = useColors();
  const firstRunDone = useSettings((s) => s.firstRunDone);
  const { width } = useWindowDimensions();
  if (!firstRunDone) return <Redirect href="/first-run" />;
  return (
    <Drawer
      drawerContent={(p) => <DrawerContent {...p} />}
      screenOptions={{
        drawerType: 'front',
        drawerStyle: { width: Math.min(layout.drawerMaxWidth, width * layout.drawerWidthRatio), backgroundColor: tc.shell },
        overlayColor: tc.scrim,
        keyboardDismissMode: 'on-drag',
        // A screen behind the one in front does not draw again until it is back in front. Changing the theme, the language or
        // the text size in Settings then redraws Settings alone, not the map and its sheets behind it.
        freezeOnBlur: true,
        // Every screen draws its own large-title header (components/ui ScreenHeader).
        headerShown: false,
        sceneStyle: { backgroundColor: tc.shell },
      }}
    >
      <Drawer.Screen name="index" options={{ swipeEnabled: false, title: t('drawerNavigate') }} />
      <Drawer.Screen name="activity" options={{ title: t('drawerActivity') }} />
      <Drawer.Screen name="account" options={{ title: t('drawerAccount') }} />
      <Drawer.Screen name="settings" options={{ title: t('drawerSettings') }} />
      <Drawer.Screen name="how-it-decides" options={{ title: t('drawerHowItDecides') }} />
      <Drawer.Screen name="debug" options={{ title: t('drawerDebug') }} />
    </Drawer>
  );
}
