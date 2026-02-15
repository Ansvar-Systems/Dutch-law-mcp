import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', '__tests__/**/*.test.ts'],
    exclude: ['node_modules', 'dist', '.git'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
    },
    reporters: ['verbose'],
    testTimeout: 5000,
    hookTimeout: 5000,
    fileParallelism: true,
    watchExclude: ['node_modules', 'dist'],
  },
});
