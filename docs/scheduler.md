# Scheduler

## Overview

The scheduler runs cron-based async jobs inside the normal runtime bootstrap.
`createServer()` starts it explicitly after `LifecycleHook.STARTUP`; there is no
hidden side-effect import involved anymore.

Supported modes:

- `attached`: scheduler jobs run as part of the normal runtime
- `standalone`: intended for scheduler-only CLI execution

## Configuration

```json
{
  "scheduler": {
    "enabled": true,
    "mode": "attached",
    "timezone": "Europe/Berlin",
    "jobs": {
      "cleanup": {
        "enabled": true,
        "cron": "*/5 * * * *",
        "module": "./dist/jobs/cleanup.job.js",
        "options": { "maxAgeMinutes": 60 }
      }
    }
  }
}
```

## Job Resolution

For each configured job, expRESTo resolves `scheduler.jobs.<name>.module` like
this:

1. If a service with that exact key exists in the ServiceRegistry and looks like
   a `SchedulerModule`, it is used directly.
2. Otherwise the value is treated as a module path.
3. Relative paths are resolved from the current working directory.

Each job module must export:

```ts
import type { SchedulerModule } from 'expresto';

const cleanupJob: SchedulerModule = {
  id: 'cleanup',
  async run(ctx, options) {
    ctx.logger.app.info('[cleanup] running', options);
  }
};

export default cleanupJob;
```

## Runtime Behavior

- Scheduler startup happens immediately after `LifecycleHook.STARTUP`.
- Jobs are registered once during bootstrap and started with `node-cron`.
- Each job has a reentrancy guard, so the same job is not executed in parallel.
- `leaderOnly` jobs are skipped on non-leader instances when a leader check is configured.
- Scheduler shutdown cancels all registered tasks before service shutdown.

Cluster interaction:

- `cluster.enabled: true` disables attached scheduler startup and emits
  `expresto.scheduler.disabled`.
- `scheduler.mode: "standalone"` together with `cluster.enabled: true` aborts
  startup with `expresto.scheduler.startup_error`.

Standalone note:

- In the direct CLI path, standalone mode prevents the HTTP server from calling
  `listen()`.
- `createServer()` still assembles and returns the runtime object either way.

## Events

Lifecycle events:

| Event | Meaning |
|------|---------|
| `expresto.scheduler.disabled` | Scheduler was intentionally not started |
| `expresto.scheduler.starting` | Scheduler bootstrap began |
| `expresto.scheduler.started` | Scheduler finished registration |
| `expresto.scheduler.startup_error` | Scheduler bootstrap failed |
| `expresto.scheduler.stopping` | Scheduler shutdown began |
| `expresto.scheduler.stopped` | Scheduler shutdown completed |

Lifecycle `reason` values currently include:

- `config_disabled`
- `cluster_enabled`
- `standalone_with_cluster`
- `initialization_failed`

Execution events:

| Event | Meaning |
|------|---------|
| `expresto.scheduler.job.start` | A cron job started |
| `expresto.scheduler.job.success` | A cron job finished successfully |
| `expresto.scheduler.job.error` | A cron job failed |
| `expresto.scheduler.job.skipped` | A cron job was skipped |
| `expresto.scheduler.timeout.start` | A timeout task started |
| `expresto.scheduler.timeout.success` | A timeout task finished successfully |
| `expresto.scheduler.timeout.error` | A timeout task failed |

## Logging

- Scheduler startup and shutdown are logged through `logger.app`
- Each job can use the same logger through `ctx.logger`
- EventBus integration is optional; without an EventBus, jobs still run

_Last updated: 2026-03-15_
