import * as cron from 'node-cron';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  vi.useRealTimers();
});

describe('SchedulerService edge cases', () => {
  it('does not initialize jobs when the scheduler is disabled', async () => {
    const ctx = createCtx();
    const register = vi.fn();
    const scheduler = new SchedulerService({ enabled: false, jobs: {} } as any, ctx);

    await scheduler.init(register);

    expect(register).not.toHaveBeenCalled();
    expect(ctx.logger.app.info).toHaveBeenCalledWith('[Scheduler] disabled via config');
  });

  it('throws when the same cron job is registered twice', () => {
    const callbacks: ScheduledCallback[] = [];
    installCronMock(callbacks);

    const ctx = createCtx();
    const scheduler = new SchedulerService({ enabled: true, jobs: {} } as any, ctx);
    const module: SchedulerModule = {
      id: 'demo',
      run: vi.fn(async () => {
        await Promise.resolve();
      }),
    };

    scheduler.register('demo', { enabled: true, cron: '* * * * *', module: 'demo' }, module);

    expect(() =>
      scheduler.register('demo', { enabled: true, cron: '* * * * *', module: 'demo' }, module)
    ).toThrow('[Scheduler] job "demo" already registered');
  });

  it('emits a skipped event when a cron job is still running', async () => {
    const emit = vi.fn();
    const callbacks: ScheduledCallback[] = [];
    installCronMock(callbacks);

    const ctx = createCtx(emit);
    const scheduler = new SchedulerService(
      {
        enabled: true,
        jobs: {
          busy: {
            enabled: true,
            cron: '* * * * *',
            module: 'busy',
          },
        },
      } as any,
      ctx
    );

    await scheduler.init(async () => ({
      id: 'busy',
      run: vi.fn(),
    }));

    (scheduler as any).tasks.get('busy').running = true;
    await callbacks[0]?.();

    expect(ctx.logger.app.warn).toHaveBeenCalledWith('[Scheduler] skip "busy" — still running');
    expectEvent(emit, 'expresto.scheduler.job.skipped', {
      source: 'scheduler-service',
      job: 'busy',
      reason: 'running',
    });
  });

  it('skips leader-only jobs when the process is not the leader', async () => {
    const emit = vi.fn();
    const callbacks: ScheduledCallback[] = [];
    installCronMock(callbacks);
    const leaderCheck = vi.fn(() => false);

    const ctx = createCtx(emit);
    const scheduler = new SchedulerService(
      {
        enabled: true,
        jobs: {
          leader: {
            enabled: true,
            cron: '* * * * *',
            module: 'leader',
            leaderOnly: true,
          },
        },
      } as any,
      ctx,
      { leaderCheck }
    );

    await scheduler.init(async () => ({
      id: 'leader',
      run: vi.fn(),
    }));

    await callbacks[0]?.();

    expect(leaderCheck).toHaveBeenCalledTimes(1);
    expect(ctx.logger.app.debug).toHaveBeenCalledWith('[Scheduler] skip "leader" — not leader');
    expectEvent(emit, 'expresto.scheduler.job.skipped', {
      source: 'scheduler-service',
      job: 'leader',
      reason: 'not_leader',
    });
  });

  it('supports cancelling timeout jobs and exposes the timeout task helpers', async () => {
    vi.useFakeTimers();

    const ctx = createCtx();
    const scheduler = new SchedulerService({ enabled: true, jobs: {} } as any, ctx);
    const fn = vi.fn();

    const cancel = scheduler.scheduleTimeout('later', fn, 50);
    const scheduled = (scheduler as any).tasks.get('later');

    expect(() => scheduler.scheduleTimeout('later', fn, 10)).toThrow(
      '[Scheduler] timeout "later" already exists'
    );

    scheduled.task.start();
    expect(scheduled.task.getStatus()).toBe('scheduled');
    scheduled.task.now();
    scheduled.task.addCallback(() => {});

    cancel();
    await vi.advanceTimersByTimeAsync(60);
    expect(fn).not.toHaveBeenCalled();

    scheduler.cancel('later');
    scheduler.cancel('missing');

    expect((scheduler as any).tasks.has('later')).toBe(false);
    expect(ctx.logger.app.info).toHaveBeenCalledWith('[Scheduler] cancelled "later"');
  });

  it('serializes non-Error timeout failures and removes finished timeout jobs', async () => {
    vi.useFakeTimers();
    const emit = vi.fn();

    const ctx = createCtx(emit);
    const scheduler = new SchedulerService({ enabled: true, jobs: {} } as any, ctx);

    scheduler.scheduleTimeout('explode', () => {
      throw 'boom';
    }, 10);

    await vi.advanceTimersByTimeAsync(20);

    expectEvent(emit, 'expresto.scheduler.timeout.error', {
      source: 'scheduler-service',
      name: 'explode',
      error: expect.objectContaining({
        message: 'boom',
      }),
    });
    expect((scheduler as any).tasks.has('explode')).toBe(false);
  });
});
