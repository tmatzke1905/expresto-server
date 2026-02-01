import * as cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { SchedulerConfig, SchedulerJobConfig, SchedulerModule, HookContext } from './types';

type Scheduled = {
  name: string;
  task: ScheduledTask;
  running: boolean; // Reentrancy-Guard
  module: SchedulerModule;
  cfg: SchedulerJobConfig;
};

type EventBusLike = {
  emit: (event: string, payload: unknown) => void;
};

function getEventBus(ctx: HookContext): EventBusLike | undefined {
  // HookContext may or may not expose an EventBus depending on the bootstrap wiring.
  // We keep this optional to avoid breaking standalone scheduler usage.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (ctx as any).eventBus as EventBusLike | undefined;
}

function serializeError(err: unknown): { name?: string; message: string; stack?: string } {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return { message: String(err) };
}

export class SchedulerService {
  private tasks = new Map<string, Scheduled>();
  private tz?: string;
  private leaderCheck?: () => Promise<boolean> | boolean; // optional external leader election

  constructor(
    private cfg: SchedulerConfig,
    private ctx: HookContext,
    opts?: { leaderCheck?: () => Promise<boolean> | boolean }
  ) {
    this.tz = this.cfg.timezone;
    this.leaderCheck = opts?.leaderCheck;
  }

  /** Lädt Jobs aus der Config und registriert sie */
  async init(register: (name: string, cfg: SchedulerJobConfig) => Promise<SchedulerModule>) {
    if (!this.cfg?.enabled) {
      this.ctx.logger.app.info('[Scheduler] disabled via config');
      return;
    }
    for (const [name, jobCfg] of Object.entries(this.cfg.jobs ?? {})) {
      if (!jobCfg.enabled) {
        this.ctx.logger.app.debug(`[Scheduler] job "${name}" disabled`);
        continue;
      }
      const module = await register(name, jobCfg);
      this.register(name, jobCfg, module);
    }
    this.ctx.logger.app.info(`[Scheduler] initialized (${this.tasks.size} jobs)`);
  }

  /** Registriert eine Cron-Task (mit Reentrancy-Guard & optional leaderOnly) */
  register(name: string, cfg: SchedulerJobConfig, mod: SchedulerModule) {
    if (this.tasks.has(name)) {
      throw new Error(`[Scheduler] job "${name}" already registered`);
    }
    const eventBus = getEventBus(this.ctx);
    const scheduled: Scheduled = {
      name,
      task: cron.schedule(
        cfg.cron,
        async () => {
          if (scheduled.running) {
            this.ctx.logger.app.warn(`[Scheduler] skip "${name}" — still running`);
            eventBus?.emit('expresto.scheduler.job.skipped', {
              job: name,
              reason: 'running',
              ts: new Date().toISOString(),
            });
            return;
          }
          // leaderOnly optional prüfen (process-scope; für verteilte Locks später LockProvider nutzen)
          if (cfg.leaderOnly && this.leaderCheck) {
            const ok = await Promise.resolve(this.leaderCheck());
            if (!ok) {
              this.ctx.logger.app.debug(`[Scheduler] skip "${name}" — not leader`);
              eventBus?.emit('expresto.scheduler.job.skipped', {
                job: name,
                reason: 'not_leader',
                ts: new Date().toISOString(),
              });
              return;
            }
          }
          scheduled.running = true;
          const started = Date.now();
          this.ctx.logger.app.info(`[Scheduler] start "${name}"`);
          eventBus?.emit('expresto.scheduler.job.start', {
            job: name,
            ts: new Date().toISOString(),
          });
          try {
            await mod.run(this.ctx, cfg.options);
            const dur = Date.now() - started;
            this.ctx.logger.app.info(`[Scheduler] done "${name}" in ${dur}ms`);
            eventBus?.emit('expresto.scheduler.job.success', {
              job: name,
              durationMs: dur,
              ts: new Date().toISOString(),
            });
          } catch (err) {
            const dur = Date.now() - started;
            this.ctx.logger.app.error(`[Scheduler] error in "${name}"`, err);
            eventBus?.emit('expresto.scheduler.job.error', {
              job: name,
              durationMs: dur,
              error: serializeError(err),
              ts: new Date().toISOString(),
            });
          } finally {
            scheduled.running = false;
          }
        },
        { timezone: cfg.timezone || this.tz }
      ),
      running: false,
      module: mod,
      cfg,
    };
    scheduled.task.start();
    this.tasks.set(name, scheduled);
  }

  /** Einmaliger Delay-Job (ohne Cron) — sinnvoll für kleine Verzögerungen */
  scheduleTimeout(name: string, fn: () => Promise<void> | void, ms: number) {
    if (this.tasks.has(name)) {
      throw new Error(`[Scheduler] timeout "${name}" already exists`);
    }
    const eventBus = getEventBus(this.ctx);
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled) return;
      const started = Date.now();
      this.ctx.logger.app.info(`[Scheduler] timeout "${name}" start`);
      eventBus?.emit('expresto.scheduler.timeout.start', { name, ts: new Date().toISOString() });
      try {
        await fn();
        this.ctx.logger.app.info(`[Scheduler] timeout "${name}" done in ${Date.now() - started}ms`);
        eventBus?.emit('expresto.scheduler.timeout.success', {
          name,
          durationMs: Date.now() - started,
          ts: new Date().toISOString(),
        });
      } catch (err) {
        const dur = Date.now() - started;
        this.ctx.logger.app.error(`[Scheduler] timeout "${name}" error`, err);
        eventBus?.emit('expresto.scheduler.timeout.error', {
          name,
          durationMs: dur,
          error: serializeError(err),
          ts: new Date().toISOString(),
        });
      } finally {
        this.tasks.delete(name);
      }
    }, ms);

    // Dummy ScheduledTask-ähnlicher Eintrag zur Verwaltung
    this.tasks.set(name, {
      name,
      task: {
        start() {
          /* no-op */
        },
        stop() {
          clearTimeout(timer);
        },
        getStatus: () => 'scheduled',
        destroy: () => clearTimeout(timer),
        now: () => {
          /* no-op */
        },
        addCallback: () => {},
      } as any,
      running: false,
      module: {
        id: name,
        run: async () => {
          await Promise.resolve();
        },
      },
      cfg: { enabled: true, cron: '', module: name },
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }

  cancel(name: string) {
    const s = this.tasks.get(name);
    if (!s) return;
    s.task.stop();
    s.task.destroy?.();
    this.tasks.delete(name);
    this.ctx.logger.app.info(`[Scheduler] cancelled "${name}"`);
  }

  cancelAll() {
    for (const name of this.tasks.keys()) this.cancel(name);
  }
}
