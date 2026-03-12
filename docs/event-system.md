# Event System

expRESTo includes an async-first event bus to allow decoupled communication between internal modules and user projects.

## Overview

- Events are identified by a string name.
- Handlers are executed **in registration order**.
- Listener execution order is deterministic: **exact** event listeners → **namespace** listeners → **wildcard** listeners.
- Handlers may be async.
- `emit()` is **fire-and-forget** (async by default).
- Use `emitAsync()` only if you explicitly want to await all handlers.

## Stable EventBus API

The framework treats the following methods as stable:

- `on(event, handler)`
- `off(event, handler)`
- `emit(event, payload)`
- `emitAsync(event, payload)`

## Naming Convention

Use a consistent namespace to avoid collisions.

- Framework events: `expresto.<domain>.<event>`
  - Common domains: `ops`, `websocket`, `scheduler`, `security`, `services`
  - Example: `expresto.websocket.connected`
- Project-specific events: `<project>.<domain>.<event>`

## Payload Standard

Framework events should use this base shape:

```ts
{
  ts: string;
  source?: string;
  context?: object;
}
```

In Expresto internals, event-specific fields are currently also kept at top-level
for backward compatibility with existing consumers.

## Using the EventBus

### Subscribing

`on()` returns an unsubscribe function.

```ts
const unsubscribe = eventBus.on('expresto.websocket.connected', async (payload) => {
  // payload: { socketId: string, auth?: unknown }
});

// later
unsubscribe();
```

#### Subscribing to namespaces and all events

Sometimes you want to observe a whole subsystem (e.g. WebSocket) without subscribing to each event.

```ts
// Observe all WebSocket-related events
const offWs = eventBus.onNamespace('expresto.websocket.', async (event, payload) => {
  // event: e.g. "expresto.websocket.connected"
});

// Observe every event (useful for debugging / tracing)
const offAny = eventBus.onAny(async (event, payload) => {
  // be careful: this will run for all events
});

// later
offWs();
offAny();
```

Notes:

- Namespace and wildcard handlers run **after** exact event handlers.
- Prefer namespaced subscriptions over `onAny()` in production.

### Emitting

`emit()` schedules async listener execution.

```ts
eventBus.emit('myproject.audit.user_login', {
  userId: '42',
  ts: new Date().toISOString(),
});
```

If you need to await all handlers:

```ts
await eventBus.emitAsync('myproject.audit.flush', { ts: Date.now() });
```

## Framework Events (currently emitted)

### WebSocket

- `expresto.websocket.connected`
  - `{ ts, source, context, socketId, auth? }`
- `expresto.websocket.disconnected`
  - `{ ts, source, context, socketId, reason }`

### Scheduler

The Scheduler emits lifecycle and execution events. All events are fire-and-forget
and emitted asynchronously.

#### Lifecycle

- `expresto.scheduler.disabled`
  - `{ ts, source, context, reason }`
- `expresto.scheduler.starting`
  - `{ ts, source, context, mode }`
- `expresto.scheduler.started`
  - `{ ts, source, context, mode }`
- `expresto.scheduler.startup_error`
  - `{ ts, source, context, reason, mode? }`
- `expresto.scheduler.stopping`
  - `{ ts, source }`
- `expresto.scheduler.stopped`
  - `{ ts, source }`

#### Job Execution

- `expresto.scheduler.job.start`
  - `{ ts, source, context, job }`
- `expresto.scheduler.job.success`
  - `{ ts, source, context, job, durationMs }`
- `expresto.scheduler.job.error`
  - `{ ts, source, context, job, durationMs, error }`
- `expresto.scheduler.job.skipped`
  - `{ ts, source, context, job, reason }`

#### Timeout Jobs

- `expresto.scheduler.timeout.start`
  - `{ ts, source, context, name }`
- `expresto.scheduler.timeout.success`
  - `{ ts, source, context, name, durationMs }`
- `expresto.scheduler.timeout.error`
  - `{ ts, source, context, name, durationMs, error }`

### Security

- `expresto.security.authorize`
  - `{ ts, source, context, mode, method, path, route, controller, result, status?, error? }`

### Services

- `expresto.services.registered`
- `expresto.services.set`
- `expresto.services.removed`
- `expresto.services.shutdown.started`
- `expresto.services.shutdown.success`
- `expresto.services.shutdown.skipped`
- `expresto.services.shutdown.error`
- `expresto.services.shutdown.completed`
  - all follow `{ ts, source, context, ...eventSpecificFields }`

## Listener Errors

If a listener throws or rejects, the EventBus forwards the error to:

- `expresto.eventbus.listener_error`

Payload:

```ts
{
  event: string;
  error: unknown;
  payload: unknown;
}
```

If nobody subscribes to this error event, the EventBus invokes an optional fallback handler
(e.g. wired to the application logger during bootstrap). If no fallback is configured,
listener errors are silently ignored.

_Last updated: 2026-03-11_
