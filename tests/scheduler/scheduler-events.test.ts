import * as cron from 'node-cron';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { SchedulerService } from '../../src/lib/scheduler/scheduler-service';
import type { SchedulerModule } from '../../src/lib/scheduler/types';

type ScheduledCallback = () => void | Promise<void>;

function createCtx(emit = vi.fn()) {
  return {
    config: {},
    logger: {
      app: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
      },
    },
    services: new Map(),
    eventBus: { emit },
  } as any;
}

function installCronMock(callbacks: ScheduledCallback[]) {
  vi.spyOn(cron, 'schedule').mockImplementation(((_expression, cb) => {
    callbacks.push(cb as ScheduledCallback);
    return {
      start: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      getStatus: vi.fn(() => 'scheduled'),
      now: vi.fn(),
      addCallback: vi.fn(),
    } as any;
  }) as typeof cron.schedule);
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
  vi.restoreAllMocks();
});

describe('Scheduler events', () => {
  it('emits expresto.scheduler.started and expresto.scheduler.stopped', async () => {
    const emit = vi.fn();
    const callbacks: ScheduledCallback[] = [];
    installCronMock(callbacks);

    const ctx = createCtx(emit);
    const scheduler = new SchedulerService(
      {
        enabled: true,
        mode: 'attached',
        jobs: {
          demo: {
            enabled: true,
            cron: '* * * * *',
            module: 'demo',
          },
        },
      },
      ctx
    );

    const register = async (): Promise<SchedulerModule> => ({
      id: 'demo',
      run: async () => {
        await Promise.resolve();
      },
    });

    await scheduler.init(register);
    scheduler.cancelAll();

    expectEvent(emit, 'expresto.scheduler.started', {
      ts: expect.any(String),
      source: 'scheduler-service',
      mode: 'attached',
      jobCount: 1,
    });

    expectEvent(emit, 'expresto.scheduler.stopped', {
      ts: expect.any(String),
      source: 'scheduler-service',
      jobCount: 1,
    });
  });

  it('emits job start/success for successful runs', async () => {
    const emit = vi.fn();
    const callbacks: ScheduledCallback[] = [];
    installCronMock(callbacks);

    const ctx = createCtx(emit);
    const scheduler = new SchedulerService(
      {
        enabled: true,
        mode: 'attached',
        jobs: {
          cleanup: {
            enabled: true,
            cron: '* * * * *',
            module: 'cleanup',
          },
        },
      },
      ctx
    );

    await scheduler.init(async () => ({
      id: 'cleanup',
      run: async () => {
        await Promise.resolve();
      },
    }));

    await callbacks[0]?.();

    expectEvent(emit, 'expresto.scheduler.job.start', {
      ts: expect.any(String),
      source: 'scheduler-service',
      job: 'cleanup',
    });

    expectEvent(emit, 'expresto.scheduler.job.success', {
      ts: expect.any(String),
      source: 'scheduler-service',
      job: 'cleanup',
      durationMs: expect.any(Number),
    });
  });

  it('emits job error for failing runs', async () => {
    const emit = vi.fn();
    const callbacks: ScheduledCallback[] = [];
    installCronMock(callbacks);

    const ctx = createCtx(emit);
    const scheduler = new SchedulerService(
      {
        enabled: true,
        mode: 'attached',
        jobs: {
          failing: {
            enabled: true,
            cron: '* * * * *',
            module: 'failing',
          },
        },
      },
      ctx
    );

    await scheduler.init(async () => ({
      id: 'failing',
      run: async () => {
        throw new Error('boom');
      },
    }));

    await callbacks[0]?.();

    expectEvent(emit, 'expresto.scheduler.job.start', {
      source: 'scheduler-service',
      job: 'failing',
    });

    expectEvent(emit, 'expresto.scheduler.job.error', {
      ts: expect.any(String),
      source: 'scheduler-service',
      job: 'failing',
      durationMs: expect.any(Number),
      error: expect.objectContaining({
        message: 'boom',
      }),
    });
  });
});
