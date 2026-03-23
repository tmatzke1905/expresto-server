# Clustering

## Supported Model

expresto-server now supports a deliberate local multi-process runtime based on a
Node.js primary/worker layout.

Supported behavior:

- the primary process only supervises workers
- workers boot the normal expresto HTTP runtime on the shared port
- attached scheduler jobs run on exactly one leader worker
- unexpected worker exits are respawned by default
- graceful shutdown starts at the primary and is propagated to workers

Not supported:

- clustered WebSocket deployments
- cross-worker metrics aggregation inside the framework
- distributed cluster coordination across multiple hosts

## Activation

Clustering is activated by configuration plus the bundled CLI bootstrap:

```json
{
  "cluster": {
    "enabled": true,
    "workers": 4,
    "respawn": true,
    "maxRestarts": 4,
    "workerShutdownTimeoutMs": 10000
  }
}
```

Run it through the packaged entrypoint:

```bash
node ./node_modules/expresto-server/dist/index.js ./middleware.config.prod.json
```

Important:

- `createServer()` never forks workers on its own
- the cluster runtime is entered by the CLI bootstrap path
- importing `createServer()` directly still creates one process-local runtime

## Process Roles

### Primary Process

The primary process is responsible for:

- spawning the configured number of workers
- marking worker slot `1` as the initial scheduler leader
- respawning workers after unexpected exits when `respawn !== false`
- enforcing `maxRestarts` per worker slot
- sending `SIGTERM` to workers during shutdown and escalating to `SIGKILL`
  after `workerShutdownTimeoutMs`

The primary process does not mount controllers or serve HTTP requests.

### Worker Processes

Each worker:

- runs the normal `createServer()` bootstrap
- listens on the configured shared TCP port
- serves HTTP requests, ops endpoints, and metrics
- exposes cluster metadata via `app.locals.cluster` and `GET /__health`

## Scheduler Behavior

In clustered mode, scheduler behavior is explicit:

- `scheduler.mode: "attached"` is supported
- only the leader worker starts the attached scheduler
- non-leader workers emit `expresto-server.scheduler.disabled` with reason
  `cluster_worker_non_leader`
- runtimes created outside the clustered CLI bootstrap emit
  `cluster_bootstrap_required` instead of guessing ownership
- `scheduler.mode: "standalone"` together with `cluster.enabled: true` aborts
  startup with a clear error

This keeps cron execution singleton without requiring a distributed lock
service for the local cluster model.

## Ops and Health in Cluster Mode

Ops endpoints stay worker-local by design.

`GET /__health` now includes:

- `pid`
- `cluster.configured`
- `cluster.active`
- `cluster.role`
- `cluster.workerId`
- `cluster.workerOrdinal`
- `cluster.workerCount`
- `cluster.schedulerLeader`

This means a health response always tells you which worker produced it instead
of pretending to be globally aggregated.

## Metrics in Cluster Mode

Prometheus metrics also remain worker-local.

Additional built-in cluster metrics:

- `cluster_worker_info{role,worker_id,worker_ordinal,scheduler_leader}`
- `cluster_workers_configured_total`

Important operational consequence:

- scraping the shared cluster port gives you one worker-local sample per
  request, not a pre-aggregated cluster total

If you need cluster-wide aggregation, do it in Prometheus / your observability
stack, not inside the framework runtime.

## WebSocket Rule

`websocket.enabled: true` together with `cluster.enabled: true` is rejected at
startup.

Reason:

- Socket.IO clustering would require a supported adapter and sticky-session
  story
- expresto-server does not claim support for that until it is implemented and
  documented as part of the public runtime surface

Use either:

- a single worker with WebSockets enabled
- or clustered HTTP without WebSockets

## Shutdown and Restart Strategy

Unexpected exits:

- the primary treats unexpected worker exits as restart candidates
- restart attempts are tracked per worker slot
- once a slot exceeds `maxRestarts`, the primary aborts the clustered runtime

Graceful shutdown:

1. the primary receives `SIGINT` or `SIGTERM`
2. workers receive `SIGTERM`
3. each worker runs normal expresto shutdown logic
4. the primary waits up to `workerShutdownTimeoutMs`
5. remaining workers receive `SIGKILL`
6. the primary flushes loggers and exits

## Recommended Production Notes

- size `cluster.workers` deliberately; `os.availableParallelism()` is only the
  default
- keep scheduler jobs idempotent even though only one worker runs them
- monitor worker restarts; repeated crashes are treated as a fatal cluster
  state
- keep WebSockets on a single-worker runtime until a supported adapter model
  exists

_Last updated: 2026-03-23_
