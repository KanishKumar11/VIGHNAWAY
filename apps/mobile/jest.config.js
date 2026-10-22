// Jest harness (BUILD_PROMPT section 10): jest-expo preset plus mocks for the native libraries.
// Library-provided mocks are used where they exist (see test/setup.ts); react-native-maps has
// none, so test/mocks/react-native-maps.tsx renders plain Views and records overlays.
const path = require('node:path');

const packages = path.resolve(__dirname, '../../packages');
// lucide-react-native's exports map hides package.json; resolve its CommonJS entry instead.
const lucide = path.resolve(path.dirname(require.resolve('lucide-react-native')), '../..');

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  setupFiles: ['<rootDir>/test/setup.ts'],
  moduleNameMapper: {
    // Workspace packages resolve to their TypeScript sources (the `@vighnaway/source` condition).
    '^@vighnaway/(contracts|engine|tokens|scenario-data)$': `${packages}/$1/src/index.ts`,
    '^react-native-maps$': '<rootDir>/test/mocks/react-native-maps.tsx',
    // Jest's react-native condition picks Lucide's .mjs build; use its CommonJS icons instead.
    '^lucide-react-native/icons/(.*)$': `${lucide}/dist/cjs/icons/$1.js`,
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@gorhom|lucide-react-native|standard-navigation))',
    '/node_modules/react-native-reanimated/plugin/',
    '/node_modules/@react-native/babel-preset/',
  ],
};
