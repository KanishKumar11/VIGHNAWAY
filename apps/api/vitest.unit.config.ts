import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/** Tests that need no database: `pnpm --filter api test:unit`. The full suite (`test`) needs Postgres. */
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  resolve: { conditions: ['@vighnaway/source'] },
  ssr: { resolve: { conditions: ['@vighnaway/source'] } },
  test: { include: ['test/unit/**/*.test.ts'], testTimeout: 30_000 },
});
