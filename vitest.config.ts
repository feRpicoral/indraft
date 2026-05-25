import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/lib/**/*.ts', 'src/app/api/**/*.ts'],
      exclude: ['**/*.test.ts', '**/types.ts', '**/index.ts'],
      thresholds: {
        // Coverage gates for safety-critical modules
        'src/lib/linter/**': { lines: 90, functions: 90, branches: 85 },
        'src/lib/generator/**': { lines: 80, functions: 80, branches: 75 },
        'src/lib/state/**': { lines: 85, functions: 85, branches: 80 },
        'src/lib/review/**': { lines: 90, functions: 90, branches: 85 },
        'src/lib/publisher/**': { lines: 80, functions: 80, branches: 75 },
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@scripts': resolve(__dirname, 'scripts'),
      '@tests': resolve(__dirname, 'tests'),
    },
  },
});
