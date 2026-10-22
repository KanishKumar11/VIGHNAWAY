/**
 * Workspace packages ship TypeScript source under the "@vighnaway/source" export condition, so
 * dev and build work without building packages first. transpilePackages compiles them.
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  reactStrictMode: true,
  // The floating dev badge would sit on top of the console's timeline.
  devIndicators: false,
  transpilePackages: [
    '@vighnaway/contracts',
    '@vighnaway/engine',
    '@vighnaway/scenario-data',
    '@vighnaway/tokens',
  ],
  // Lint runs separately (pnpm lint); next build should not depend on an ESLint config.
  eslint: { ignoreDuringBuilds: true },
  webpack(config) {
    const existing = config.resolve.conditionNames ?? ['...'];
    config.resolve.conditionNames = ['@vighnaway/source', ...existing.filter((c) => c !== '@vighnaway/source')];
    return config;
  },
};

export default nextConfig;
