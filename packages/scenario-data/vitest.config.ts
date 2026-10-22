import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { conditions: ['@vighnaway/source'] },
  ssr: { resolve: { conditions: ['@vighnaway/source'] } },
  test: { include: ['test/**/*.test.ts'] },
});
