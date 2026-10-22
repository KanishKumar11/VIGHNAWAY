/* Jest setup (BUILD_PROMPT section 10). Official library mocks where they exist. */
import 'react-native-gesture-handler/jestSetup';

jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
// Reanimated 4.7's official mock loads src/index.ts, whose native initializer calls
// setCSSEventHandler on the JS fallback module and throws under Jest. Use the package's own
// non-native initializer (initializers.ts) instead, then the official mock.
jest.mock('react-native-reanimated/src/initializers', () => ({ initializeReanimatedModule: () => undefined }));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
// The official mock exports `default` without __esModule, so a default import would get the
// whole module object; mark it as an ES module.
jest.mock('@gorhom/bottom-sheet', () => ({ __esModule: true, ...require('@gorhom/bottom-sheet/mock') }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('react-native-keyboard-controller', () => require('react-native-keyboard-controller/jest'));
jest.mock('@react-native-community/netinfo', () => require('@react-native-community/netinfo/jest/netinfo-mock.js'));
// react-native-mmkv v4 returns its own in-memory instance under Jest (isTest()); only the Nitro
// native module it would otherwise load needs a stub.
jest.mock('react-native-nitro-modules', () => ({
  NitroModules: {
    createHybridObject: () => {
      throw new Error('Nitro modules are not available in Jest');
    },
  },
}));
// react-native-maps has no official mock: test/mocks/react-native-maps.tsx (moduleNameMapper).
// expo-notifications has no official Jest mock and warns about Expo Go push on import.
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async () => ({ granted: false, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: false, canAskAgain: true })),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  AndroidImportance: { HIGH: 4, DEFAULT: 3 },
}));
// lottie-react-native renders a native view; under Jest a plain View stands in for it.
jest.mock('lottie-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { __esModule: true, default: (props: { style?: object }) => React.createElement(View, { testID: 'lottie', style: props.style }) };
});
