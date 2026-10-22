import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // SWC emits decorator metadata, like tsc does for the build (esbuild does not).
  plugins: [swc.vite({ module: { type: 'es6' } })],
  resolve: { conditions: ['@vighnaway/source'] },
  ssr: { resolve: { conditions: ['@vighnaway/source'] } },
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    // Every file shares the vighnaway_test database.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
