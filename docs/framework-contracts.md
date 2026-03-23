# Expresto Framework Contracts

This document defines the supported v1 runtime contracts for expresto-server.

For the exact package root exports, see [public-api.md](./public-api.md).

## Stable Contract Areas

The supported contracts in v1 are:

- package root exports documented in `docs/public-api.md`
- JSON configuration schema
- clustered CLI runtime behavior documented in `docs/clustering.md`
- controller module contract
- hook system contract
- EventBus contract
- ServiceRegistry contract
- scheduler job contract
- documented framework events

## EventBus Contract

Stable methods:

- `on(event, handler)`
- `off(event, handler)`
- `emit(event, payload)`
- `emitAsync(event, payload)`

Execution guarantees:

- exact event listeners run first
- namespace listeners run next
- wildcard listeners run last
- listener execution order is stable by registration

Framework event names follow:

```txt
expresto-server.<domain>.<event>
```

## Hook System Contract

Supported lifecycle hooks:

- `LifecycleHook.INITIALIZE`
- `LifecycleHook.STARTUP`
- `LifecycleHook.PRE_INIT`
- `LifecycleHook.CUSTOM_MIDDLEWARE`
- `LifecycleHook.POST_INIT`
- `LifecycleHook.SHUTDOWN`
- `LifecycleHook.SECURITY`

Hook handlers receive a `HookContext` with:

- `app`
- `config`
- `logger`
- `eventBus`
- `services`
- `request` for request-scoped security hooks

## ServiceRegistry Contract

Stable methods:

- `register`
- `set`
- `get`
- `has`
- `remove`
- `delete`
- `list`
- `getAll`
- `shutdownAll`

Shutdown behavior:

- `shutdown()` is preferred when present
- `close()` is used as fallback
- failures do not stop shutdown of remaining services

## Controller Contract

The stable v1 controller contract is a default export shaped like:

```ts
export default {
  route: '/example',
  handlers: [
    {
      method: 'get',
      path: '/',
      secure: false,
      handler: (_req, res) => {
        res.json({ ok: true });
      },
    },
  ],
};
```

The object form above is the documented and supported package contract.

## Scheduler Job Contract

The stable scheduler job contract is a `SchedulerModule` export:

```ts
import type { SchedulerModule } from 'expresto-server';

const job: SchedulerModule = {
  id: 'cleanup',
  async run(ctx, options) {
    void ctx;
    void options;
  },
};

export default job;
```

Jobs must be async-safe and must not block the event loop.

## Explicitly Unsupported in v1

The following are not stable runtime contracts in the first release:

- plugin loading and plugin configuration
- clustered WebSocket behavior
- undocumented internal classes that are not exported from the package root

_Last updated: 2026-03-23_
