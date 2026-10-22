import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono/500Medium';
import { NotoSansDevanagari_400Regular } from '@expo-google-fonts/noto-sans-devanagari/400Regular';
import { NotoSansDevanagari_500Medium } from '@expo-google-fonts/noto-sans-devanagari/500Medium';
import { NotoSansDevanagari_600SemiBold } from '@expo-google-fonts/noto-sans-devanagari/600SemiBold';
import { NotoSansDevanagari_700Bold } from '@expo-google-fonts/noto-sans-devanagari/700Bold';
import { JetBrainsMono_700Bold } from '@expo-google-fonts/jetbrains-mono/700Bold';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useMemo } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { startLiveMode } from '@/features/live/mode';
import { startLiveSync } from '@/features/live/liveSync';
import { useTripEngine } from '@/features/trip/useTripEngine';
import { configureNotifications } from '@/lib/notifications';
import { devanagari, fontFamily, useTheme } from '@/theme';
import { useSettings } from '@/stores/settings';
import { navThemeFor } from '@/theme/navTheme';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);
SplashScreen.setOptions({ duration: 600, fade: true });

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

// expo-router already provides a SafeAreaProvider at the root: do not add another here.
export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    [fontFamily.regular]: Inter_400Regular,
    [fontFamily.medium]: Inter_500Medium,
    [fontFamily.semibold]: Inter_600SemiBold,
    [fontFamily.bold]: Inter_700Bold,
    // Instrument readouts (DESIGN.md 11.1): ETA digits, clocks, ages, eyebrow labels.
    [fontFamily.mono]: JetBrainsMono_500Medium,
    [fontFamily.monoBold]: JetBrainsMono_700Bold,
    // Devanagari for Hindi and Marathi (Inter has no Devanagari glyphs).
    [devanagari.regular]: NotoSansDevanagari_400Regular,
    [devanagari.medium]: NotoSansDevanagari_500Medium,
    [devanagari.semibold]: NotoSansDevanagari_600SemiBold,
    [devanagari.bold]: NotoSansDevanagari_700Bold,
  });
  // A language switch re-renders every screen in the new language (navigation state is kept by
  // the container; see the report).
  const language = useSettings((s) => s.language);

  useTripEngine();
  const theme = useTheme();
  const navTheme = useMemo(() => navThemeFor(theme.name), [theme.name]);

  useEffect(() => {
    void configureNotifications();
    const stopSync = startLiveSync();
    const stopLive = startLiveMode();
    return () => {
      stopSync();
      stopLive();
    };
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hide();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.colors.shell }}>
      <KeyboardProvider>
        <QueryClientProvider client={queryClient}>
          <BottomSheetModalProvider>
            <ThemeProvider value={navTheme}>
              <Stack key={language} screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(drawer)" />
                <Stack.Screen name="first-run" options={{ animation: 'fade' }} />
                <Stack.Screen name="report" options={{ presentation: 'modal' }} />
                <Stack.Screen name="drive" options={{ animation: 'fade' }} />
                <Stack.Screen name="map-list" options={{ animation: 'slide_from_right' }} />
              </Stack>
            </ThemeProvider>
          </BottomSheetModalProvider>
        </QueryClientProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
