import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        '**/tests/**',
        '**/node_modules/**',
        'middleware.config.schema.json',
        'src/cli.ts',
        'src/**/*.d.ts',
        'src/lib/types.ts',
        'src/lib/scheduler/types.ts',
      ],
      thresholds: {
        statements: 80,
        lines: 80,
      },
    },
  },
});
