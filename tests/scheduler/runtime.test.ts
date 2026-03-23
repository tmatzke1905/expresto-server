import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLUSTER_ENV } from '../../src/lib/cluster/context';
import { SchedulerService } from '../../src/lib/scheduler/scheduler-service';
import { startScheduler, stopScheduler } from '../../src/lib/scheduler/runtime';
import { ServiceRegistry } from '../../src/lib/services/service-registry';
import type { SchedulerJobConfig, SchedulerModule } from '../../src/lib/scheduler/types';

const originalEnv = { ...process.env };

function restoreEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }

  for (const [key, value] of Object.entries(originalEnv)) {
    process.env[key] = value;
  }
}

function createCtx(overrides: Record<string, any> = {}) {
  const emit = vi.fn();
  const services = new ServiceRegistry({ emit });
  const ctx = {
    config: {
      cluster: { enabled: false },
      scheduler: {
        enabled: true,
        mode: 'attached',
        jobs: {},
      },
    },
    logger: {
      app: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },
    },
    eventBus: { emit },
    services,
    ...overrides,
  } as any;

  return { ctx, emit, services };
}

function expectEvent(
  emit: ReturnType<typeof vi.fn>,
  eventName: string,
  payloadMatcher: Parameters<typeof expect.objectContaining>[0]
) {
  const match = emit.mock.calls.find(([event]) => event === eventName);
  expect(match).toBeDefined();
  expect(match?.[1]).toEqual(expect.objectContaining(payloadMatcher));
}

afterEach(() => {
  restoreEnv();
  vi.restoreAllMocks();
  vi.resetModules();
  vi.doUnmock('node:cluster');
});

describe('scheduler runtime bootstrap', () => {
  it('emits disabled when scheduler config is missing or disabled', async () => {
    const { ctx, emit } = createCtx({
      config: {},
    });

    await startScheduler(ctx);

    expect(ctx.logger.app.info).toHaveBeenCalledWith('[Scheduler] disabled');
    expect(ctx.services.has('scheduler')).toBe(false);
    expectEvent(emit, 'expresto-server.scheduler.disabled', {
      source: 'scheduler-runtime',
      reason: 'config_disabled',
    });
  });

  it('skips duplicate startup when a scheduler service already exists', async () => {
    const { ctx } = createCtx();
    ctx.services.set('scheduler', { shutdown: vi.fn() });

    await startScheduler(ctx);

    expect(ctx.logger.app.warn).toHaveBeenCalledWith(
      '[Scheduler] startup skipped because a scheduler service is already registered'
    );
  });

  it('disables attached scheduler startup until the clustered bootstrap activates worker ownership', async () => {
    const { ctx, emit } = createCtx({
      config: {
        cluster: { enabled: true },
        scheduler: {
          enabled: true,
          mode: 'attached',
          jobs: {},
        },
      },
    });

    await startScheduler(ctx);

    expect(ctx.logger.app.warn).toHaveBeenCalledWith(
      '[Scheduler] disabled until the clustered CLI bootstrap activates worker ownership'
    );
    expect(ctx.services.has('scheduler')).toBe(false);
    expectEvent(emit, 'expresto-server.scheduler.disabled', {
      source: 'scheduler-runtime',
      reason: 'cluster_bootstrap_required',
    });
  });

  it('rejects standalone scheduler startup in cluster mode', async () => {
    const { ctx, emit } = createCtx({
      config: {
        cluster: { enabled: true },
        scheduler: {
          enabled: true,
          mode: 'standalone',
          jobs: {},
        },
      },
    });

    await expect(startScheduler(ctx)).rejects.toThrow(
      '[Scheduler] standalone mode is not allowed with cluster enabled'
    );

    expectEvent(emit, 'expresto-server.scheduler.startup_error', {
      source: 'scheduler-runtime',
      reason: 'standalone_with_cluster',
      mode: 'standalone',
    });
  });

  it('resolves scheduler jobs from registered services before importing a module path', async () => {
    const { ctx, services, emit } = createCtx({
      config: {
        cluster: { enabled: false },
        scheduler: {
          enabled: true,
          mode: 'attached',
          jobs: {
            cleanup: {
              enabled: true,
              cron: '* * * * *',
              module: 'cleanup-job',
            },
          },
        },
      },
    });
    const moduleFromService: SchedulerModule & { shutdown: () => void } = {
      id: 'cleanup',
      run: vi.fn(async () => {
        await Promise.resolve();
      }),
      shutdown: vi.fn(),
    };
    services.set('cleanup-job', moduleFromService);

    const initSpy = vi
      .spyOn(SchedulerService.prototype, 'init')
      .mockImplementation(async register => {
        const resolved = await register(
          'cleanup',
          ctx.config.scheduler.jobs.cleanup as SchedulerJobConfig
        );
        expect(resolved).toBe(moduleFromService);
      });

    await startScheduler(ctx);

    expect(initSpy).toHaveBeenCalledTimes(1);
    expect(ctx.services.has('scheduler')).toBe(true);
    expectEvent(emit, 'expresto-server.scheduler.starting', {
      source: 'scheduler-runtime',
      mode: 'attached',
      schedulerLeader: false,
    });
  });

  it('disables attached scheduler startup on non-leader cluster workers', async () => {
    process.env[CLUSTER_ENV.enabled] = 'true';
    process.env[CLUSTER_ENV.schedulerLeader] = 'false';
    process.env[CLUSTER_ENV.workerCount] = '2';
    process.env[CLUSTER_ENV.workerOrdinal] = '2';

    const { ctx, emit } = createCtx({
      config: {
        cluster: { enabled: true },
        scheduler: {
          enabled: true,
          mode: 'attached',
          jobs: {},
        },
      },
    });

    vi.resetModules();
    vi.doMock('node:cluster', () => ({
      default: {
        isWorker: true,
        worker: { id: 9 },
      },
    }));

    const { startScheduler: startSchedulerWithWorker } =
      await import('../../src/lib/scheduler/runtime');

    await startSchedulerWithWorker(ctx);

    expect(ctx.logger.app.info).toHaveBeenCalledWith(
      '[Scheduler] disabled on non-leader cluster worker'
    );
    expectEvent(emit, 'expresto-server.scheduler.disabled', {
      source: 'scheduler-runtime',
      reason: 'cluster_worker_non_leader',
      workerId: 9,
      workerOrdinal: 2,
    });
  });

  it('resolves scheduler job modules from relative paths', async () => {
    const { ctx } = createCtx({
      config: {
        cluster: { enabled: false },
        scheduler: {
          enabled: true,
          mode: 'attached',
          jobs: {
            dummy: {
              enabled: true,
              cron: '* * * * *',
              module: './tests/jobs/dummy.job.ts',
            },
          },
        },
      },
    });

    vi.spyOn(SchedulerService.prototype, 'init').mockImplementation(async register => {
      const resolved = await register(
        'dummy',
        ctx.config.scheduler.jobs.dummy as SchedulerJobConfig
      );
      expect(resolved.id).toBe('dummy');
      expect(typeof resolved.run).toBe('function');
    });

    await startScheduler(ctx);
  });

  it('removes the scheduler service and emits startup_error when initialization fails', async () => {
    const { ctx, emit } = createCtx();

    vi.spyOn(SchedulerService.prototype, 'init').mockRejectedValue('boom');

    await expect(startScheduler(ctx)).rejects.toBe('boom');

    expect(ctx.services.has('scheduler')).toBe(false);
    expectEvent(emit, 'expresto-server.scheduler.startup_error', {
      source: 'scheduler-runtime',
      reason: 'initialization_failed',
      mode: 'attached',
      error: expect.objectContaining({
        message: 'boom',
      }),
    });
  });

  it('rejects invalid imported job modules', async () => {
    const { ctx, emit } = createCtx({
      config: {
        cluster: { enabled: false },
        scheduler: {
          enabled: true,
          mode: 'attached',
          jobs: {
            invalid: {
              enabled: true,
              cron: '* * * * *',
              module: './tests/controllers/ping-controller.ts',
            },
          },
        },
      },
    });

    vi.spyOn(SchedulerService.prototype, 'init').mockImplementation(async register => {
      await register('invalid', ctx.config.scheduler.jobs.invalid as SchedulerJobConfig);
    });

    await expect(startScheduler(ctx)).rejects.toThrow(
      '[Scheduler] module "./tests/controllers/ping-controller.ts" does not export a valid SchedulerModule'
    );

    expect(ctx.services.has('scheduler')).toBe(false);
    expectEvent(emit, 'expresto-server.scheduler.startup_error', {
      source: 'scheduler-runtime',
      reason: 'initialization_failed',
    });
  });

  it('stops and unregisters the scheduler service during shutdown', async () => {
    const { ctx, emit } = createCtx();
    const shutdown = vi.fn().mockResolvedValue(undefined);
    ctx.services.set('scheduler', { shutdown });

    await stopScheduler(ctx);

    expect(shutdown).toHaveBeenCalledTimes(1);
    expect(ctx.services.has('scheduler')).toBe(false);
    expect(ctx.logger.app.info).toHaveBeenCalledWith('[Scheduler] shutting down...');
    expectEvent(emit, 'expresto-server.scheduler.stopping', {
      source: 'scheduler-runtime',
    });
  });

  it('returns silently when shutdown runs without a scheduler service', async () => {
    const { ctx, emit } = createCtx();

    await stopScheduler(ctx);

    expect(ctx.logger.app.info).not.toHaveBeenCalledWith('[Scheduler] shutting down...');
    expect(emit.mock.calls.some(([event]) => event === 'expresto-server.scheduler.stopping')).toBe(
      false
    );
  });
});
