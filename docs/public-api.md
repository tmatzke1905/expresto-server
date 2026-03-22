# Public API

This document defines the supported npm package surface for the first
production release of expresto-server.

Only the APIs documented here are considered stable package entrypoints for
v1.x.

## Package Root Exports

Stable runtime bootstrap:

- `createServer`
- `ExprestoRuntime` type

Stable hook API:

- `HookManager`
- `hookManager`
- `LifecycleHook`
- `HookContext` type

Stable event API:

- `EventBus`
- `createEventPayload`
- `EventBusOptions` type
- `EventHandler` type
- `StableEventBus` type
- related EventBus payload types

Stable service API:

- `ServiceRegistry`

Stable error API:

- `AppError`
- `HttpError`
- `BadRequestError`
- `UnauthorizedError`
- `ForbiddenError`
- `NotFoundError`
- `ConflictError`
- `InternalServerError`

Stable JWT helper API:

- `signToken`
- `verifyToken`
- `SupportedHmacAlg` type

Stable config and authoring types:

- `AppConfig`
- `AuthConfig`
- `OpsConfig`
- `SchedulerConfig`
- `SchedulerJobConfig`
- `WebsocketConfig`
- `ExprestoRuntime`
- `SchedulerMode`
- `SchedulerModule`
- `ExtRequest`
- `ExtResponse`
- `ExtHandler`
- `ExtNext`
- `SecurityMode`
- `AppLogger`

## Runtime Bootstrap

### `createServer(configInput)`

Creates the expresto-server runtime from either:

- a path to a JSON config file
- an `AppConfig` object

It returns:

- `app`: the assembled Express app
- `config`: the validated runtime config
- `logger`: the framework logger bundle
- `hookManager`: the hook manager instance used for bootstrap and shutdown
- `eventBus`: the runtime EventBus
- `services`: the shared ServiceRegistry
- `getSocketServer()`: the shared Socket.IO server after `runtime.app.listen(...)`
  when `websocket.enabled=true`

`createServer()` assembles the runtime but does not call `listen()` for you.

### `runtime.getSocketServer()`

Returns the Socket.IO `Server` instance that expresto-server attaches to the
shared HTTP server.

Behavior rules:

- returns `undefined` before `runtime.app.listen(...)` has been called
- returns `undefined` when `websocket.enabled` is not set to `true`
- returns the same Socket.IO server instance for the lifetime of the runtime
- is the supported extension point for custom event registration on the shared
  WebSocket server

Supported usage pattern:

```ts
import { createServer } from 'expresto-server';

const runtime = await createServer('./middleware.config.prod.json');

runtime.app.listen(runtime.config.port, runtime.config.host ?? '0.0.0.0');

const io = runtime.getSocketServer();
if (!io) {
  throw new Error('Socket.IO server is not available for this runtime.');
}

io.on('connection', socket => {
  socket.on('chat:join', payload => {
    socket.emit('chat:joined', payload);
  });
});
```

Example with a config file:

```ts
import { createServer } from 'expresto-server';

const runtime = await createServer('./middleware.config.prod.json');

runtime.app.listen(runtime.config.port, runtime.config.host ?? '0.0.0.0');
```

Example with an inline config object:

```ts
import { createServer, type AppConfig } from 'expresto-server';

const config: AppConfig = {
  port: 3000,
  host: '127.0.0.1',
  contextRoot: '/api',
  controllersPath: './dist/controllers',
  log: {
    level: 'info',
    application: './logs/application.log',
    access: './logs/access.log',
  },
  cors: { enabled: false, options: {} },
  helmet: { enabled: false, options: {} },
  rateLimit: { enabled: false, options: {} },
  metrics: { enabled: true, endpoint: '/__metrics' },
  telemetry: { enabled: false },
  auth: { jwt: { enabled: false }, basic: { enabled: false } },
};

const runtime = await createServer(config);
```

For config fields and runtime rules, see [Configuration](./configuration.md).

## Hook API

Stable hook exports:

- `HookManager`
- `hookManager`
- `LifecycleHook`
- `HookContext`

Supported `HookManager` instance methods:

| Method | Purpose |
|------|---------|
| `register(hook, callback)` | Register a callback for a lifecycle hook |
| `on(hook, callback)` | Alias for `register()` |
| `emit(hook, context)` | Run all callbacks for a hook and await completion |

Typical usage with the shared `hookManager`:

```ts
import { hookManager, LifecycleHook } from 'expresto-server';

hookManager.on(LifecycleHook.STARTUP, async ctx => {
  const cache = await createCacheClient();
  ctx.services.set('cache', cache);
});

hookManager.on(LifecycleHook.POST_INIT, async ctx => {
  ctx.logger.app.info('Application routes loaded', {
    services: ctx.services.list(),
  });
});
```

Isolated usage in tests or standalone modules:

```ts
import { HookManager, LifecycleHook, ServiceRegistry } from 'expresto-server';

const hooks = new HookManager();
const services = new ServiceRegistry();

hooks.on(LifecycleHook.STARTUP, async ctx => {
  ctx.services.set('mail', { shutdown: async () => {} });
});

await hooks.emit(LifecycleHook.STARTUP, {
  app: undefined,
  config: {} as never,
  logger: {
    app: console,
    access: console,
  } as never,
  services,
});
```

For hook order and runtime behavior, see [Lifecycle Hooks](./lifecycle-hooks.md).

## Event API

Stable event exports:

- `EventBus`
- `createEventPayload`
- `EventBusOptions`
- `EventHandler`
- `StableEventBus`

Stable `EventBus` methods:

| Method | Purpose |
|------|---------|
| `on(event, handler)` | Subscribe to an event and get an unsubscribe function |
| `off(event, handler)` | Remove a previously registered handler |
| `emit(event, payload)` | Fire-and-forget async emission |
| `emitAsync(event, payload)` | Emit and await all handlers |

`createEventPayload(source, context)` builds the standard payload shape used by
framework events.

Example:

```ts
import { EventBus, createEventPayload } from 'expresto-server';

const eventBus = new EventBus({
  onUnhandledListenerError: ({ event, error }) => {
    console.error('Listener error', event, error);
  },
});

const unsubscribe = eventBus.on('example.audit.user_login', async payload => {
  console.log(payload.source, payload.userId);
});

await eventBus.emitAsync(
  'example.audit.user_login',
  createEventPayload('example-app', {
    userId: '42',
    route: '/api/login',
  })
);

unsubscribe();
```

Use `emit()` when listeners should run in the background:

```ts
eventBus.emit(
  'example.audit.user_login',
  createEventPayload('example-app', { userId: '42' })
);
```

For naming conventions, framework event names, and broader EventBus patterns,
see [Event System](./event-system.md).

## Service API

Stable service export:

- `ServiceRegistry`

Supported `ServiceRegistry` methods:

| Method | Purpose |
|------|---------|
| `register(name, instance)` | Add a service and throw if the key already exists |
| `set(name, instance)` | Add or replace a service |
| `get(name)` | Return a service or throw if it does not exist |
| `has(name)` | Check whether a service exists |
| `remove(name)` | Remove a service without a return value |
| `delete(name)` | Remove a service and return whether it existed |
| `list()` | Return all registered service names |
| `getAll()` | Return all services as an object |
| `shutdownAll()` | Call `shutdown()` or `close()` on registered services if available |

Example:

```ts
import { ServiceRegistry } from 'expresto-server';

const services = new ServiceRegistry();

services.register('db', {
  query: async (sql: string) => [{ sql }],
  shutdown: async () => {
    console.log('db closed');
  },
});

if (services.has('db')) {
  const db = services.get<{ query: (sql: string) => Promise<unknown[]> }>('db');
  await db.query('select 1');
}

console.log(services.list());
await services.shutdownAll();
```

For runtime usage through hooks and shutdown behavior, see
[Service Registry](./service-registry.md).

## Error API

Stable error exports:

- `AppError`
- `HttpError`
- `BadRequestError`
- `UnauthorizedError`
- `ForbiddenError`
- `NotFoundError`
- `ConflictError`
- `InternalServerError`

Use these errors in controllers and hooks when you want HTTP-aware failures.

Example controller:

```ts
import { BadRequestError, NotFoundError, type ExtRequest, type ExtResponse } from 'expresto-server';

export default {
  route: '/users',
  handlers: [
    {
      method: 'get',
      path: '/:id',
      secure: 'jwt',
      handler: async (req: ExtRequest, res: ExtResponse) => {
        const userId = req.params.id;
        if (!userId) {
          throw new BadRequestError('Missing user id', { code: 'USER_ID_REQUIRED' });
        }

        const user = await findUserById(userId);
        if (!user) {
          throw new NotFoundError('User not found', { code: 'USER_NOT_FOUND' });
        }

        res.json(user);
      },
    },
  ],
};
```

## JWT Helper API

Stable JWT exports:

- `signToken`
- `verifyToken`
- `SupportedHmacAlg`

Example:

```ts
import { signToken, verifyToken } from 'expresto-server';

const secret = 'replace-with-a-real-secret';

const token = await signToken(
  { sub: 'demo-user', role: 'admin' },
  secret,
  'HS256',
  '1h'
);

const payload = await verifyToken<{ sub: string; role: string }>(
  token,
  secret,
  'HS256'
);

console.log(payload.sub, payload.role);
```

See [Security](./security.md) for runtime auth configuration.

## Authoring Types and Runtime Contracts

The following user-facing contracts are supported in v1:

- the package root exports listed above
- the JSON configuration schema in `middleware.config.schema.json`
- the documented controller module contract
- the documented scheduler job contract
- the documented EventBus event names and payload shapes

Controller authoring example:

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

Scheduler job authoring example:

```ts
import type { SchedulerModule } from 'expresto-server';

const cleanupJob: SchedulerModule = {
  id: 'cleanup',
  async run(ctx, options) {
    ctx.logger.app.info('cleanup job running', options);
  },
};

export default cleanupJob;
```

Schema resolution example:

```ts
const schemaPath = require.resolve('expresto-server/middleware.config.schema.json');
```

See the focused guides for the full authoring contracts:

- [Configuration](./configuration.md)
- [Controllers](./controllers.md)
- [Scheduler](./scheduler.md)
- [Event System](./event-system.md)

## Explicitly Out of Scope for v1

The following areas are intentionally not supported package API in the first
release:

- plugin loading and plugin configuration
- a real multi-process cluster runtime
- internal classes that are not exported from the package root

If one of these areas becomes supported later, it should first be added to this
document and to the versioning policy.

_Last updated: 2026-03-22_
