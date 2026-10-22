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
  },
});
