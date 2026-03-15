export type SchedulerMode = 'attached' | 'standalone';

export interface SchedulerJobConfig {
  enabled: boolean;
  cron: string; // Cron-Syntax, z.B. "*/5 * * * *"
  module: string; // Pfad oder Service-Key des Job-Moduls
  timezone?: string; // optional override
  leaderOnly?: boolean; // nur auf Leader/Single-Instance (Cluster/Container)
  options?: Record<string, unknown>;
}

export interface SchedulerConfig {
  enabled: boolean;
  mode?: SchedulerMode; // default: 'attached'
  timezone?: string; // default: process TZ
  jobs: Record<string, SchedulerJobConfig>;
}

export interface SchedulerModule {
  /** Eindeutige ID/Name des Moduls (z.B. 'cleanup') */
  id: string;
  /** Wird bei Trigger ausgeführt – MUSS async-sicher sein */
  run(ctx: HookContext, options?: Record<string, unknown>): Promise<void>;
}

/** Kontext für Job-Ausführung — identisch zum Framework-Hook-Kontext. */
export type HookContext = import('../hooks').HookContext;
