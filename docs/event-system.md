# Event System

expRESTo includes an async-first event bus to allow decoupled communication between internal modules and user projects.

## Overview

- Events are identified by a string name.
- Handlers are executed **in registration order**.
- Handlers may be async.
- `emit()` is **fire-and-forget** (async by default).
- Use `emitAsync()` only if you explicitly want to await all handlers.

## Naming Convention

Use a consistent namespace to avoid collisions.

- Framework events: `expresto.<domain>.<event>`
  - Example: `expresto.websocket.connected`
- Project-specific events: `<project>.<domain>.<event>`

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
  - `{ socketId: string, auth?: unknown }`
- `expresto.websocket.disconnected`
  - `{ socketId: string, reason: string }`

### Scheduler

The Scheduler emits lifecycle and execution events. All events are fire-and-forget
and emitted asynchronously.

#### Lifecycle

- `expresto.scheduler.disabled`
  - `{ reason: string, ts: string }`
- `expresto.scheduler.starting`
  - `{ mode: string, ts: string }`
- `expresto.scheduler.started`
  - `{ mode: string, ts: string }`
- `expresto.scheduler.startup_error`
  - `{ reason: string, mode?: string, ts: string }`
- `expresto.scheduler.stopping`
  - `{ ts: string }`
- `expresto.scheduler.stopped`
  - `{ ts: string }`

#### Job Execution

- `expresto.scheduler.job.start`
  - `{ job: string, ts: string }`
- `expresto.scheduler.job.success`
  - `{ job: string, durationMs: number, ts: string }`
- `expresto.scheduler.job.error`
  - `{ job: string, durationMs: number, error: unknown, ts: string }`
- `expresto.scheduler.job.skipped`
  - `{ job: string, reason: string, ts: string }`

#### Timeout Jobs

- `expresto.scheduler.timeout.start`
  - `{ name: string, ts: string }`
- `expresto.scheduler.timeout.success`
  - `{ name: string, durationMs: number, ts: string }`
- `expresto.scheduler.timeout.error`
  - `{ name: string, durationMs: number, error: unknown, ts: string }`

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

_Last updated: 2026-02-01_
