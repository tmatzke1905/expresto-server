# Configuration

expresto-server uses one JSON runtime config. The current minimum supported runtime is
Node.js 22.

## Example

```json
{
  "port": 8080,
  "host": "0.0.0.0",
  "contextRoot": "/api",
  "controllersPath": "./dist/controllers",
  "log": {
    "level": "info",
    "application": "./logs/application.log",
    "access": "./logs/access.log"
  },
  "cors": {
    "enabled": true,
    "options": { "origin": "*" }
  },
  "helmet": {
    "enabled": true,
    "options": {}
  },
  "metrics": {
    "enabled": true,
    "endpoint": "/__metrics"
  },
  "auth": {
    "jwt": {
      "enabled": true,
      "secret": "replace-with-a-real-secret",
      "algorithm": "HS256"
    }
  },
  "ops": {
    "enabled": true,
    "secure": "jwt"
  },
  "scheduler": {
    "enabled": true,
    "mode": "attached",
    "jobs": {}
  }
}
```

## Fields

| Field                              | Description                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------- |
| `port`                             | Port used when you call `app.listen(...)` or run the built CLI entrypoint           |
| `host`                             | Interface used by the CLI listener                                                  |
| `contextRoot`                      | Prefix for controller routes and ops endpoints                                      |
| `controllersPath`                  | Directory containing controller modules                                             |
| `log.level`                        | `error`, `warn`, `info`, `debug`, `trace`, or `fatal`                               |
| `log.application`                  | Application log file                                                                |
| `log.access`                       | Access log file                                                                     |
| `log.traceRequests`                | Extra request tracing in logger integration                                         |
| `cors.enabled`                     | Defaults to enabled unless explicitly set to `false`                                |
| `cors.options`                     | Passed to `cors(...)`                                                               |
| `helmet.enabled`                   | Defaults to enabled unless explicitly set to `false`                                |
| `helmet.options`                   | Passed to `helmet(...)`                                                             |
| `rateLimit.enabled`                | Mounts `express-rate-limit` only when `true`                                        |
| `rateLimit.options`                | Passed to `express-rate-limit`                                                      |
| `metrics.enabled`                  | Defaults to enabled unless explicitly set to `false`                                |
| `metrics.endpoint`                 | Prometheus endpoint outside `contextRoot`, default `/__metrics`                     |
| `telemetry.enabled`                | Enables OpenTelemetry request spans                                                 |
| `telemetry.serviceName`            | Logical service name for telemetry attributes                                       |
| `auth.jwt.enabled`                 | Enables JWT validation for JWT-protected routes                                     |
| `auth.jwt.secret`                  | Required shared HMAC secret                                                         |
| `auth.jwt.algorithm`               | `HS256`, `HS384`, or `HS512`                                                        |
| `auth.jwt.expiresIn`               | Optional token lifetime for helper tooling                                          |
| `auth.basic.enabled`               | Enables Basic Auth validation                                                       |
| `auth.basic.users`                 | Username/password map or array of `{ username, password }`                          |
| `ops.enabled`                      | Defaults to enabled unless explicitly set to `false`                                |
| `ops.secure`                       | `none`, `basic`, or `jwt`                                                           |
| `cluster.enabled`                  | Enables the clustered primary/worker runtime when you use the bundled CLI bootstrap |
| `cluster.workers`                  | Worker count, default `os.availableParallelism()`                                   |
| `cluster.respawn`                  | Respawn unexpectedly exited workers, default `true`                                 |
| `cluster.maxRestarts`              | Maximum automatic restarts per worker slot before the primary aborts                |
| `cluster.workerShutdownTimeoutMs`  | Grace period before the primary escalates worker shutdown to `SIGKILL`              |
| `scheduler.enabled`                | Enables the scheduler bootstrap                                                     |
| `scheduler.mode`                   | `attached` or `standalone`                                                          |
| `scheduler.timezone`               | Default timezone for cron jobs                                                      |
| `scheduler.jobs.<name>.enabled`    | Enables or disables an individual job                                               |
| `scheduler.jobs.<name>.cron`       | Cron expression for the job                                                         |
| `scheduler.jobs.<name>.module`     | Service key or module path for the job                                              |
| `scheduler.jobs.<name>.timezone`   | Optional per-job timezone override                                                  |
| `scheduler.jobs.<name>.leaderOnly` | Skips job execution on non-leader instances when leader checks are configured       |
| `scheduler.jobs.<name>.options`    | Arbitrary JSON payload passed to `run(ctx, options)`                                |
| `websocket.enabled`                | Enables Socket.IO on the shared HTTP server                                         |
| `websocket.path`                   | Socket.IO path                                                                      |
| `websocket.cors`                   | Socket.IO CORS settings                                                             |

## Runtime Rules

- `cors.enabled`, `helmet.enabled`, and `metrics.enabled` are opt-out flags.
- `controllersPath` and scheduler job `module` paths are resolved from the
  current working directory unless you use absolute paths.
- `createServer()` always assembles the runtime and returns an Express app.
  The bundled CLI entrypoint is what decides whether an HTTP listener is opened
  and whether cluster workers are forked.
- `cluster.enabled: true` is activated only in the bundled CLI bootstrap path.
  `createServer()` itself never forks workers.
- `scheduler.mode: "standalone"` suppresses `listen()` only in the direct CLI
  startup path. It is rejected if `cluster.enabled` is also `true`.
- In clustered mode, attached scheduler startup is leader-only. Non-leader
  workers emit `expresto-server.scheduler.disabled` with
  `reason: "cluster_worker_non_leader"`.
- When `cluster.enabled: true` is configured but the runtime is created outside
  the clustered CLI bootstrap, attached scheduler startup stays disabled and
  emits `reason: "cluster_bootstrap_required"`.
- `websocket.enabled: true` together with `cluster.enabled: true` aborts
  startup with a clear error.

## Security-Sensitive Rules

- `auth.jwt.enabled: true` requires `auth.jwt.secret`
- placeholder JWT secrets are rejected at startup
- `auth.basic.enabled: true` requires at least one configured user
- `websocket.enabled: true` requires secure JWT configuration
- when `NODE_ENV=production`, ops endpoints must be disabled or protected

Recommended production options:

```json
{
  "ops": {
    "enabled": false
  }
}
```

or:

```json
{
  "ops": {
    "enabled": true,
    "secure": "basic"
  }
}
```

## Tips

- Use `port: 0` only in tests when you pass config objects directly
- Keep `contextRoot` starting with `/`
- Prefer absolute log paths in packaged deployments
- Use built `.js` scheduler job modules in npm/published deployments
- Treat ops and metrics responses in cluster mode as worker-local, not
  aggregated cluster-wide

_Last updated: 2026-03-23_
