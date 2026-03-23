# expresto-server

expresto-server is an Express-based framework for secured, observable APIs with
file-based controllers, lifecycle hooks, metrics, schedulers, and optional
WebSocket support.

## Supported v1 Scope

The first supported release focuses on the parts that are implemented,
packaged, and tested today:

- `createServer()` runtime bootstrap
- local multi-process cluster bootstrap through the bundled CLI runtime
- `runtime.getSocketServer()` after HTTP startup when WebSockets are enabled
- file-based controller loading
- JWT and Basic Auth
- lifecycle hooks
- EventBus and ServiceRegistry primitives
- Prometheus metrics and OpenTelemetry request tracing
- attached or standalone scheduler runtime
- Socket.IO support on the shared HTTP server

The following topics are intentionally not part of the supported v1 scope:

- clustered WebSocket deployments
- plugin loading and plugin configuration

## Install

```bash
npm install expresto-server
```

## Quick Start

Minimal application bootstrap:

```ts
import { createServer } from 'expresto-server';

const runtime = await createServer('./middleware.config.prod.json');

runtime.app.listen(runtime.config.port, runtime.config.host ?? '0.0.0.0');
```

The packaged runtime can also be started directly:

```bash
node ./node_modules/expresto-server/dist/index.js ./middleware.config.prod.json
```

`createServer()` assembles the runtime and returns the Express app together
with config, logger, EventBus, hook manager, services, and a supported
`getSocketServer()` accessor. It does not call `listen()` on its own.

## Cluster Runtime

When `cluster.enabled` is set, the bundled CLI bootstrap (`dist/index.js`) runs
the runtime in a local primary/worker layout:

- the primary process supervises workers and performs graceful shutdown
- workers serve HTTP traffic on the shared port
- the attached scheduler runs only on the designated leader worker
- ops endpoints and Prometheus metrics stay worker-local and expose cluster
  metadata explicitly

`createServer()` itself still assembles a single runtime and never forks
processes on its own.

## WebSocket Extension API

When `websocket.enabled` is set, the supported extension flow is:

```ts
import { createServer } from 'expresto-server';

const runtime = await createServer('./middleware.config.prod.json');

runtime.app.listen(runtime.config.port, runtime.config.host ?? '0.0.0.0');

const io = runtime.getSocketServer();
if (!io) {
  throw new Error('Socket.IO server is only available after app.listen().');
}

io.on('connection', socket => {
  socket.emit('server.ready', { ok: true });
});
```

`getSocketServer()` returns `undefined` when WebSockets are disabled or when the
runtime has not been attached to an HTTP server with `runtime.app.listen(...)`.

## Stable Controller Contract

```ts
import type { ExtRequest, ExtResponse } from 'expresto-server';

export default {
  route: '/ping',
  handlers: [
    {
      method: 'get',
      path: '/',
      secure: false,
      handler: (_req: ExtRequest, res: ExtResponse) => {
        res.json({ pong: true });
      },
    },
  ],
};
```

## Public API

The package root exports the supported extension primitives for v1, including:

- `createServer`
- `ExprestoRuntime`
- `hookManager`, `HookManager`, `LifecycleHook`
- `EventBus`, `createEventPayload`
- `ServiceRegistry`
- `HttpError` and the common HTTP error subclasses
- `signToken`, `verifyToken`
- the documented config, hook, controller, and scheduler types

See [Public API](./docs/public-api.md) for the exact supported surface,
method reference, and copy-paste examples for bootstrap, hooks, events,
services, JWT helpers, WebSocket access, and error handling.

## Documentation

- [Public API](./docs/public-api.md)
- [Releases](./docs/releases.md)
- [Release Notes](./docs/release-notes/1.1.0-beta.md)
- [Configuration](./docs/configuration.md)
- [Controllers](./docs/controllers.md)
- [Security](./docs/security.md)
- [Lifecycle Hooks](./docs/lifecycle-hooks.md)
- [Service Registry](./docs/service-registry.md)
- [Scheduler](./docs/scheduler.md)
- [WebSocket](./docs/websocket.md)
- [Metrics](./docs/metrics.md)
- [Event System](./docs/event-system.md)
- [Framework Contracts](./docs/framework-contracts.md)

Roadmap-only topics:

- [Plugin System](./docs/plugin-system.md)

Implemented runtime guides:

- [Clustering](./docs/clustering.md)

## License

MIT License. See [LICENSE](./LICENSE).

_Last updated: 2026-03-23_
