import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/contract/**/*.test.ts'],
    exclude: ['node_modules', 'dist', '.git'],
    reporters: ['verbose'],
    testTimeout: 15000,
    hookTimeout: 30000,
    fileParallelism: false,
    watchExclude: ['node_modules', 'dist'],
  },
});
