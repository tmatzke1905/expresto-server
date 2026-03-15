# expresto

expRESTo is an Express-based framework for secured, observable APIs with
file-based controllers, lifecycle hooks, metrics, schedulers, and optional
WebSocket support.

## Supported v1 Scope

The first supported release focuses on the parts that are implemented,
packaged, and tested today:

- `createServer()` runtime bootstrap
- file-based controller loading
- JWT and Basic Auth
- lifecycle hooks
- EventBus and ServiceRegistry primitives
- Prometheus metrics and OpenTelemetry request tracing
- attached or standalone scheduler runtime
- Socket.IO support on the shared HTTP server

The following topics are intentionally not part of the supported v1 scope:

- full multi-process cluster runtime
- plugin loading and plugin configuration
- a public Socket.IO accessor such as `getSocketServer()`

## Install

```bash
npm install expresto
```

## Quick Start

Minimal application bootstrap:

```ts
import { createServer } from 'expresto';

const runtime = await createServer('./middleware.config.prod.json');

runtime.app.listen(runtime.config.port, runtime.config.host ?? '0.0.0.0');
```

The packaged runtime can also be started directly:

```bash
node ./node_modules/expresto/dist/index.js ./middleware.config.prod.json
```

`createServer()` assembles the runtime and returns the Express app together
with config, logger, EventBus, hook manager, and services. It does not call
`listen()` on its own.

## Stable Controller Contract

```ts
import type { ExtRequest, ExtResponse } from 'expresto';

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
- `hookManager`, `HookManager`, `LifecycleHook`
- `EventBus`, `createEventPayload`
- `ServiceRegistry`
- `HttpError` and the common HTTP error subclasses
- `signToken`, `verifyToken`
- the documented config, hook, controller, and scheduler types

See [Public API](./docs/public-api.md) for the exact supported surface.

## Documentation

- [Public API](./docs/public-api.md)
- [Releases](./docs/releases.md)
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

- [Clustering](./docs/clustering.md)
- [Plugin System](./docs/plugin-system.md)

## License

MIT License. See [LICENSE](./LICENSE).

_Last updated: 2026-03-15_
