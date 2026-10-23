import type { ConfigContext, ExpoConfig } from 'expo/config';
// The built CJS entry of the tokens package (Node evaluates this file, not Metro).
import { colors } from '@vighnaway/tokens';

/**
 * VIGHNAWAY app config. Every key and host comes from the environment:
 *
 * - GOOGLE_MAPS_ANDROID_KEY / GOOGLE_MAPS_IOS_KEY: native Maps SDK keys, restricted by package name
 *   + SHA-1 (Android) or bundle id (iOS). Optional: without them the app shows its map fallback.
 * - EXPO_PUBLIC_API_URL: default API base URL (also editable in Settings). Read at runtime by the JS
 *   bundle, not here.
 * - USE_CLEARTEXT=1: allow plain-HTTP traffic on Android (laptop API on the phone hotspot). Leave it
 *   unset for builds that reach the API over HTTPS.
 *
 * Native splash and icon backgrounds need colour strings at build time; they are read from
 * @vighnaway/tokens so no colour is hard-coded here either.
 */
const androidMapsKey = process.env.GOOGLE_MAPS_ANDROID_KEY?.trim() || '';
const iosMapsKey = process.env.GOOGLE_MAPS_IOS_KEY?.trim() || '';
const useCleartext = process.env.USE_CLEARTEXT === '1';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'VIGHNAWAY',
  slug: 'vighnaway',
  scheme: 'vighnaway',
  version: '0.1.0',
  // web only for the browser design preview (WEB_PREVIEW=1); the product is Android first.
  platforms: process.env.WEB_PREVIEW === '1' ? ['android', 'ios', 'web'] : ['android', 'ios'],
  web: { output: 'single', bundler: 'metro' },
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  userInterfaceStyle: 'light',
  backgroundColor: colors.shell,
  ios: {
    bundleIdentifier: 'app.vighnaway',
    supportsTablet: false,
  },
  android: {
    package: 'app.vighnaway',
    adaptiveIcon: {
      backgroundColor: colors.shell,
      foregroundImage: './assets/images/android-icon-foreground.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    // Routes live in the root app/ directory (never src/app).
    ['expo-router', { root: './app' }],
    'expo-dev-client',
    ['./plugins/withNetworkSecurityConfig', { cleartext: useCleartext }],
    [
      'react-native-maps',
      {
        androidGoogleMapsApiKey: androidMapsKey || undefined,
        iosGoogleMapsApiKey: iosMapsKey || undefined,
      },
    ],
    [
      'expo-build-properties',
      {
        android: {
          ...(useCleartext ? { usesCleartextTraffic: true } : {}),
          // Release builds run R8. WorkManager (pulled in by expo-notifications) creates its Room database by
          // reflection, and R8 renamed it away: the release APK crashed at launch with "Failed to create an
          // instance of class androidx.work.impl.WorkDatabase". Keep Room databases and their generated classes.
          extraProguardRules: [
            '-keep class * extends androidx.room.RoomDatabase { *; }',
            '-keep class androidx.work.impl.** { *; }',
            '-keep class androidx.room.** { *; }',
            '-dontwarn androidx.room.paging.**',
          ].join('\n'),
        },
      },
    ],
    [
      'expo-notifications',
      {
        color: colors.routeRecommended,
        // Local notifications only (route changes while backgrounded); no remote push.
        enableRemoteNotifications: false,
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'VIGHNAWAY uses your location only while the app is open, to place a hazard report or start a route from where you are.',
        locationAlwaysPermission: false,
        locationAlwaysAndWhenInUsePermission: false,
        isAndroidBackgroundLocationEnabled: false,
        isIosBackgroundLocationEnabled: false,
      },
    ],
    [
      'expo-image-picker',
      {
        // The camera is only opened when the traveller taps "Take photo" in a report; no gallery access, no microphone.
        cameraPermission: 'VIGHNAWAY uses the camera only when you tap Take photo in a hazard report, to show operators what the place looks like.',
        photosPermission: false,
        microphonePermission: false,
      },
    ],
    'expo-font',
    [
      'expo-splash-screen',
      {
        backgroundColor: colors.shell,
        image: './assets/images/splash-icon.png',
        imageWidth: 200,
        resizeMode: 'contain',
      },
    ],
    'expo-sharing',
  ],
  experiments: {
    typedRoutes: false,
    reactCompiler: false,
  },
  extra: {
    ...config.extra,
    /** Whether a native Maps key was configured at build time (the key itself is not exposed here). */
    googleMapsConfigured: {
      android: androidMapsKey.length > 0,
      ios: iosMapsKey.length > 0,
    },
    usesCleartextTraffic: useCleartext,
    /** When this build was made (ISO, UTC). The menu shows it, so a phone can be told apart from an older install. */
    buildTime: new Date().toISOString(),
  },
});
