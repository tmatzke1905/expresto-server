# Service Registry

The ServiceRegistry is the shared runtime store for infrastructure services
such as database clients, queues, caches, and route metadata.

It is available through hook context as `ctx.services` and is also exported
from the package root.

## Typical Usage

Register a service during startup:

```ts
import { hookManager, LifecycleHook } from 'expresto';

hookManager.on(LifecycleHook.STARTUP, async ctx => {
  const db = await connectDatabase();
  ctx.services.set('db', db);
});
```

Access a service later:

```ts
import { hookManager, LifecycleHook } from 'expresto';

hookManager.on(LifecycleHook.POST_INIT, async ctx => {
  if (ctx.services.has('db')) {
    const db = ctx.services.get('db');
    void db;
  }
});
```

## Supported API

The stable ServiceRegistry methods in v1 are:

- `register(name, instance)`
- `set(name, instance)`
- `get(name)`
- `has(name)`
- `remove(name)`
- `delete(name)`
- `list()`
- `getAll()`
- `shutdownAll()`

## Shutdown Behavior

`shutdownAll()` calls one of these methods on each registered service if
available:

- `shutdown()`
- `close()`

If neither method exists, the registry logs a warning and continues.

The central runtime already calls `shutdownAll()` during graceful shutdown, so
applications usually do not need to call it from their own shutdown hooks.

## Recommendations

- Register services under stable, descriptive names
- Prefer `has()` before `get()` when a service is optional
- Give long-lived services a `shutdown()` or `close()` method
- Avoid storing request-scoped values in the registry

_Last updated: 2026-03-15_
