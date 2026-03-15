# Expresto Startup Sequence

This document describes the runtime order implemented by `createServer()` and
the direct CLI bootstrap in `src/index.ts`.

## `createServer()` Bootstrap

`createServer()` assembles the runtime and returns:

- `app`
- `config`
- `logger`
- `hookManager`
- `eventBus`
- `services`

It does not call `listen()` by itself.

### Runtime Order

1. Load and validate configuration.
2. Validate runtime security rules.
3. Create logger, EventBus, ServiceRegistry, and Express app.
4. Emit `LifecycleHook.INITIALIZE`.
5. Emit `LifecycleHook.STARTUP`.
6. Start the scheduler if `scheduler.enabled === true`.
7. Emit `LifecycleHook.PRE_INIT`.
8. Mount built-in middleware:
   - Prometheus middleware and `/__metrics` when `metrics.enabled !== false`
   - `express.json()`
   - `cors(...)` when `cors.enabled !== false`
   - `helmet(...)` when `helmet.enabled !== false`
   - `express-rate-limit` when `rateLimit.enabled === true`
   - OpenTelemetry middleware
9. Create the `SecurityProvider`.
10. Emit `LifecycleHook.CUSTOM_MIDDLEWARE`.
11. Mount access logging.
12. Load controllers and register route metadata.
13. Mount ops endpoints when `ops.enabled !== false`.
14. Emit `LifecycleHook.POST_INIT`.
15. Return the assembled runtime object.

## Direct CLI Execution

When `dist/index.js` is executed directly:

1. `createServer()` runs first.
2. If `scheduler.mode === "standalone"` and the scheduler is enabled, the
   process stays in scheduler-only mode and no HTTP listener is opened.
3. Otherwise the framework calls `app.listen(config.port, config.host)`.
4. If WebSockets are enabled, `WebSocketManager` is attached to that HTTP
   server.

## Shutdown Order

On `SIGINT`, `SIGTERM`, `uncaughtException`, or `unhandledRejection`:

1. Scheduler shutdown begins.
2. `LifecycleHook.SHUTDOWN` is emitted.
3. All registered services are shut down through `ServiceRegistry.shutdownAll()`.
4. The HTTP server is closed if it was started by the CLI path.
5. Log appenders are flushed.
6. The process exits.

## Failure Behavior

- Config validation failures abort startup before any runtime is returned.
- Failing `INITIALIZE`, `STARTUP`, `PRE_INIT`, or `POST_INIT` hooks abort
  `createServer()`.
- Failing scheduler bootstrap aborts `createServer()`.
- Failing `CUSTOM_MIDDLEWARE` hooks are logged and bootstrap continues.

_Last updated: 2026-03-15_
