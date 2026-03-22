import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    watchExclude: [
      'dist/**',
      'coverage/**',
      'tests/tmp/**',
      'logs/**',
      'tests/logs/**',
      '**/access.log',
      '**/application.log',
    ],
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
        statements: 85,
        functions: 85,
        lines: 85,
      },
    },
  },
});
