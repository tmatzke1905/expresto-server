import path from 'node:path';
import { createEventPayload } from '../events';
import type { HookContext } from '../hooks';
import { SchedulerService } from './scheduler-service';
import type { SchedulerConfig, SchedulerJobConfig, SchedulerModule } from './types';

function isSchedulerModule(value: unknown): value is SchedulerModule {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'run' in value &&
    typeof value.run === 'function'
  );
}

function serializeError(err: unknown): { name?: string; message: string; stack?: string } {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
  }

  return { message: String(err) };
}

function getSchedulerConfig(ctx: HookContext): SchedulerConfig | undefined {
  return ctx.config.scheduler;
}

async function resolveSchedulerModule(
  ctx: HookContext,
  cfg: SchedulerJobConfig
): Promise<SchedulerModule> {
  if (ctx.services.has(cfg.module)) {
    const service = ctx.services.get<unknown>(cfg.module);
    if (isSchedulerModule(service)) {
      return service;
    }
  }

  const specifier = path.isAbsolute(cfg.module) ? cfg.module : path.resolve(cfg.module);
  const mod = await import(/* @vite-ignore */ specifier);
  const job = mod.default ?? mod;

  if (!isSchedulerModule(job)) {
    throw new Error(`[Scheduler] module "${cfg.module}" does not export a valid SchedulerModule`);
  }

  return job;
}

export async function startScheduler(ctx: HookContext): Promise<void> {
  const schedCfg = getSchedulerConfig(ctx);
  const eventBus = ctx.eventBus;

  if (!schedCfg?.enabled) {
    eventBus?.emit(
      'expresto.scheduler.disabled',
      createEventPayload('scheduler-runtime', { reason: 'config_disabled' })
    );
    ctx.logger.app.info('[Scheduler] disabled');
    return;
  }

  if (ctx.services.has('scheduler')) {
    ctx.logger.app.warn('[Scheduler] startup skipped because a scheduler service is already registered');
    return;
  }

  if (ctx.config.cluster?.enabled) {
    if (schedCfg.mode === 'standalone') {
      const err = new Error('[Scheduler] standalone mode is not allowed with cluster enabled');
      eventBus?.emit(
        'expresto.scheduler.startup_error',
        createEventPayload('scheduler-runtime', {
          reason: 'standalone_with_cluster',
          mode: schedCfg.mode,
          error: serializeError(err),
        })
      );
      throw err;
    }

    ctx.logger.app.warn('[Scheduler] disabled (cluster mode active)');
    eventBus?.emit(
      'expresto.scheduler.disabled',
      createEventPayload('scheduler-runtime', { reason: 'cluster_enabled' })
    );
    return;
  }

  eventBus?.emit(
    'expresto.scheduler.starting',
    createEventPayload('scheduler-runtime', { mode: schedCfg.mode ?? 'attached' })
  );

  const scheduler = new SchedulerService(schedCfg, ctx);
  ctx.services.set('scheduler', scheduler);

  try {
    await scheduler.init((_name: string, cfg: SchedulerJobConfig) => resolveSchedulerModule(ctx, cfg));
  } catch (err) {
    ctx.services.delete('scheduler');
    eventBus?.emit(
      'expresto.scheduler.startup_error',
      createEventPayload('scheduler-runtime', {
        reason: 'initialization_failed',
        mode: schedCfg.mode ?? 'attached',
        error: serializeError(err),
      })
    );
    throw err;
  }
}

export async function stopScheduler(ctx: HookContext): Promise<void> {
  if (!ctx.services.has('scheduler')) {
    return;
  }

  const eventBus = ctx.eventBus;
  const scheduler = ctx.services.get<SchedulerService>('scheduler');

  eventBus?.emit('expresto.scheduler.stopping', createEventPayload('scheduler-runtime'));
  ctx.logger.app.info('[Scheduler] shutting down...');
  await scheduler.shutdown();
  ctx.services.delete('scheduler');
}
