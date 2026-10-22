import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    conditions: ['@vighnaway/source'],
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  ssr: { resolve: { conditions: ['@vighnaway/source'] } },
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['test/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    // The OSM extract is 10 MB: loading it in a busy worker can take longer than the 5 s default.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
