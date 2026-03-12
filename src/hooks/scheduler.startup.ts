import { hookManager, LifecycleHook, HookContext } from '../lib/hooks';
import { createEventPayload, type StableEventBus } from '../lib/events';
import { SchedulerService } from '../lib/scheduler/scheduler-service';
import type { SchedulerConfig, SchedulerJobConfig, SchedulerModule } from '../lib/scheduler/types';

// HookContext may or may not expose an EventBus depending on bootstrap wiring.
// We keep this optional to avoid breaking standalone scheduler usage.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getEventBus = (ctx: HookContext) => (ctx as any).eventBus as { emit: StableEventBus['emit'] } | undefined;

hookManager.on(LifecycleHook.STARTUP, async (ctx: HookContext) => {
  const schedCfg: SchedulerConfig | undefined = ctx.config.scheduler;
  const eventBus = getEventBus(ctx);
  if (!schedCfg?.enabled) {
    eventBus?.emit('expresto.scheduler.disabled', createEventPayload('scheduler-startup-hook', { reason: 'config_disabled' }));
    ctx.logger.app.info('[Scheduler] disabled');
    return;
  }

  // Cluster-Check
  if (ctx.config.cluster?.enabled) {
    if (schedCfg.mode === 'standalone') {
      eventBus?.emit('expresto.scheduler.startup_error', createEventPayload('scheduler-startup-hook', {
        reason: 'standalone_with_cluster',
        mode: schedCfg.mode,
      }));
      throw new Error('[Scheduler] standalone mode is not allowed with cluster enabled');
    }
    ctx.logger.app.warn('[Scheduler] disabled (cluster mode active)');
    eventBus?.emit('expresto.scheduler.disabled', createEventPayload('scheduler-startup-hook', { reason: 'cluster_enabled' }));
    return;
  }

  eventBus?.emit('expresto.scheduler.starting', createEventPayload('scheduler-startup-hook', { mode: schedCfg.mode }));
  const scheduler = new SchedulerService(schedCfg, ctx);
  ctx.services.set('scheduler', scheduler);

  const register = async (name: string, cfg: SchedulerJobConfig): Promise<SchedulerModule> => {
    const svc = ctx.services.get(cfg.module) as SchedulerModule | undefined;
    if (svc?.run && svc.id) return svc;

    const mod = await import(/* @vite-ignore */ cfg.module);
    const job: SchedulerModule = mod.default ?? mod;
    if (!job?.run) {
      throw new Error(`[Scheduler] module "${cfg.module}" does not export a SchedulerModule`);
    }
    return job;
  };

  await scheduler.init(register);
  eventBus?.emit('expresto.scheduler.started', createEventPayload('scheduler-startup-hook', { mode: schedCfg.mode }));
});

hookManager.on(LifecycleHook.SHUTDOWN, async (ctx: HookContext) => {
  const eventBus = getEventBus(ctx);
  const scheduler = ctx.services.get('scheduler') as SchedulerService | undefined;
  if (scheduler) {
    eventBus?.emit('expresto.scheduler.stopping', createEventPayload('scheduler-startup-hook'));
    ctx.logger.app.info('[Scheduler] shutting down...');
    scheduler.cancelAll();
    eventBus?.emit('expresto.scheduler.stopped', createEventPayload('scheduler-startup-hook'));
  }
});
