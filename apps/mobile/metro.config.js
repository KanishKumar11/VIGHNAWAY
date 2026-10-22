// Metro config for the pnpm monorepo (node-linker=hoisted, see /.npmrc).
// Expo SDK 58's default config already watches the workspace root and resolves hoisted
// node_modules; we only add the `@vighnaway/source` export condition so workspace packages
// resolve to their TypeScript sources (packages/*/src/index.ts) instead of a stale dist/.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.unstable_conditionNames = [
  '@vighnaway/source',
  ...(config.resolver.unstable_conditionNames ?? ['require', 'import']),
];

// Browser preview for design review only (WEB_PREVIEW=1 npx expo export --platform web): swap
// native-only modules for shims. Native builds never take this branch.
if (process.env.WEB_PREVIEW === '1') {
  const path = require('path');
  const shims = {
    'react-native-maps': path.join(__dirname, 'web-preview/react-native-maps.tsx'),
    'lottie-react-native': path.join(__dirname, 'web-preview/lottie-react-native.tsx'),
  };
  const upstream = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (platform === 'web' && shims[moduleName]) return { type: 'sourceFile', filePath: shims[moduleName] };
    return upstream ? upstream(context, moduleName, platform) : context.resolveRequest(context, moduleName, platform);
  };
}

module.exports = config;
