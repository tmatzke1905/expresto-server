import { describe, expect, it, vi } from 'vitest';
import { startConfiguredRuntime } from '../../src/lib/runtime-cli';
import type { AppConfig } from '../../src/lib/config';
import type { AppLogger } from '../../src/lib/logger';

function createLogger(): AppLogger {
  return {
    app: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      fatal: vi.fn(),
    },
    access: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      fatal: vi.fn(),
    },
  } as unknown as AppLogger;
}

function createConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 3000,
    host: '127.0.0.1',
    contextRoot: '/api',
    controllersPath: './tests/controllers',
    log: {
      access: './tests/logs/access.log',
      application: './tests/logs/application.log',
      level: 'ERROR',
    },
    auth: { jwt: { enabled: false }, basic: { enabled: false } },
    ...overrides,
  } as AppConfig;
}

describe('startConfiguredRuntime', () => {
  it('starts the HTTP app and logs the listening address', async () => {
    const logger = createLogger();
    const listen = vi.fn((port: number, host: string, callback?: () => void) => {
      callback?.();
      return { port, host };
    });
    const runtime = {
      app: { listen },
      config: createConfig({ host: undefined, port: 4010 }),
      logger,
    };
    const createRuntime = vi.fn().mockResolvedValue(runtime);

    const result = await startConfiguredRuntime(createRuntime, './middleware.config.json');

    expect(createRuntime).toHaveBeenCalledWith('./middleware.config.json');
    expect(listen).toHaveBeenCalledWith(4010, '0.0.0.0', expect.any(Function));
    expect(logger.app.info).toHaveBeenCalledWith('expresto-server listening at http://0.0.0.0:4010');
    expect(result).toBe(runtime);
  });

  it('does not start HTTP when the runtime is scheduler-only standalone', async () => {
    const logger = createLogger();
    const listen = vi.fn();
    const runtime = {
      app: { listen },
      config: createConfig({
        scheduler: {
          enabled: true,
          mode: 'standalone',
          jobs: {},
        },
      }),
      logger,
    };
    const createRuntime = vi.fn().mockResolvedValue(runtime);

    const result = await startConfiguredRuntime(createRuntime, './scheduler.config.json');

    expect(listen).not.toHaveBeenCalled();
    expect(logger.app.info).toHaveBeenCalledWith(
      'expresto-server running in scheduler-only standalone mode (no HTTP server)'
    );
    expect(result).toBe(runtime);
  });
});
