

# Scheduler

## Overview

The Scheduler in **expRESTo** allows you to run asynchronous tasks based on cron expressions.  
It is designed to be safe, extensible, and integrated with the core services of the framework.

- **Cluster-aware**: The scheduler is **disabled automatically** if `cluster.enabled = true`.
- **Modes**:
  - **attached**: Scheduler runs alongside the HTTP server.
  - **standalone**: Scheduler runs without HTTP, only jobs.

---

## Configuration

In your global configuration file:

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

### Properties

- **enabled**: Enables/disables the scheduler globally.
- **mode**: `"attached"` or `"standalone"`. Standalone mode must not run with cluster.
- **timezone**: Optional. Default is process timezone.
- **jobs**: A dictionary of named jobs, each with:
  - **enabled**: Activate or disable the job.
  - **cron**: Cron expression for scheduling.
  - **module**: Path or service key to the job module.
  - **timezone**: Optional override per job.
  - **options**: Arbitrary JSON object passed to the job at runtime.

---

## Job Modules

A job module must implement the `SchedulerModule` interface:

```ts
import type { SchedulerModule } from '../lib/scheduler/types';

const cleanupJob: SchedulerModule = {
  id: 'cleanup',
  async run(ctx, options) {
    ctx.logger.app.info('[cleanup] running...');
    // Use ctx.services to access DB pools, queues, etc.
  }
};

export default cleanupJob;
```

- **id**: Unique identifier of the job.
- **run**: Async function called on every execution. Receives:
  - **ctx**: HookContext (includes logger, config, services).
  - **options**: Configuration from global config.

---

## Lifecycle

- Jobs are registered during the **STARTUP** hook.
- At runtime, each job:
  - Runs asynchronously.
  - Is protected by a reentrancy guard (no parallel executions of the same job).
- On **SHUTDOWN**, all jobs are cancelled.

## Events

The Scheduler emits lifecycle and execution events via the **EventBus**.
All framework events are namespaced under `expresto.scheduler.*`.

These events are **fire-and-forget** and emitted asynchronously.
They are intended for observability, metrics, auditing, and custom integrations.

### Lifecycle Events

| Event | Description | Payload |
|------|------------|---------|
| `expresto.scheduler.disabled` | Scheduler was not started | `{ reason, ts }` |
| `expresto.scheduler.starting` | Scheduler initialization started | `{ mode, ts }` |
| `expresto.scheduler.started` | Scheduler successfully started | `{ mode, ts }` |
| `expresto.scheduler.startup_error` | Scheduler startup failed | `{ reason, mode?, ts }` |
| `expresto.scheduler.stopping` | Scheduler shutdown initiated | `{ ts }` |
| `expresto.scheduler.stopped` | Scheduler shutdown completed | `{ ts }` |

`reason` values include:
- `config_disabled`
- `cluster_enabled`
- `standalone_with_cluster`

### Job Execution Events

| Event | Description | Payload |
|------|------------|---------|
| `expresto.scheduler.job.start` | Job execution started | `{ job, ts }` |
| `expresto.scheduler.job.success` | Job finished successfully | `{ job, durationMs, ts }` |
| `expresto.scheduler.job.error` | Job execution failed | `{ job, durationMs, error, ts }` |
| `expresto.scheduler.job.skipped` | Job execution skipped | `{ job, reason, ts }` |

`reason` values include:
- `running` (previous execution still active)
- `not_leader` (leader-only job on non-leader instance)

### Timeout Job Events

Timeout-based scheduler tasks emit the following events:

| Event | Description | Payload |
|------|------------|---------|
| `expresto.scheduler.timeout.start` | Timeout task started | `{ name, ts }` |
| `expresto.scheduler.timeout.success` | Timeout task finished | `{ name, durationMs, ts }` |
| `expresto.scheduler.timeout.error` | Timeout task failed | `{ name, durationMs, error, ts }` |
---

## Usage

### Attached Mode
Scheduler runs together with REST endpoints.  
Best for lightweight recurring tasks (cache refresh, metrics sync).

### Standalone Mode
Scheduler runs without HTTP server.  
Best for heavy or long-running jobs (batch reports, imports).

---

## Logging

- Scheduler logs each job’s start, completion time, and errors into the `application.log`.
- Jobs can also use `ctx.logger` for custom logging.

> **Note**  
> The EventBus is optional. If no EventBus is registered in the HookContext,
> the Scheduler continues to operate without emitting events.
```
