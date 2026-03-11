# Expresto Framework Contracts

This document defines the core **runtime contracts** of the Expresto framework.

Contracts describe the **stable interfaces between framework components**.

They are important for:

- preventing breaking changes
- enabling plugin development
- allowing safe internal refactoring
- documenting extension points

Every contract described here should be considered **stable API** unless explicitly marked otherwise.

---

# Contract Categories

Expresto exposes the following core runtime contracts:

```
EventBus Contract
Hook System Contract
ServiceRegistry Contract
Controller Contract
Scheduler Job Contract
WebSocket Event Contract
Configuration Contract
```

Each contract defines:

- responsibilities
- expected interfaces
- stability guarantees

---

# EventBus Contract

Location:

```
src/lib/events.ts
```

The EventBus enables asynchronous communication between modules.

## Required API

```
on(event: string, handler: EventHandler): void
off(event: string, handler: EventHandler): void
emit(event: string, payload?: unknown): void
emitAsync(event: string, payload?: unknown): Promise<void>
```

## Handler Contract

Handlers must support asynchronous execution.

```
type EventHandler = (payload?: unknown) => void | Promise<void>
```

## Execution Guarantees

- handlers are executed in registration order
- `emit()` does not wait for handlers
- `emitAsync()` waits for all handlers

## Event Naming

Event names must follow this pattern:

```
expresto.<domain>.<event>
```

Example:

```
expresto.websocket.connected
expresto.scheduler.job.success
```

---

# Hook System Contract

Location:

```
src/lib/hooks.ts
```

Hooks provide controlled lifecycle extension points.

## Registration

```
hookManager.on(hookName, handler)
```

## Handler Signature

```
async function handler(ctx: HookContext)
```

## HookContext

Typical context fields:

```
config
services
eventBus
logger
```

## Supported Hooks

```
INITIALIZE
BEFORE_STARTUP
AFTER_STARTUP
BEFORE_SHUTDOWN
```

Hooks must always be executed sequentially.

---

# ServiceRegistry Contract

Location:

```
src/services/service-registry.ts
```

The ServiceRegistry manages infrastructure services.

## Required API

```
register(name: string, service: unknown): void
get(name: string): unknown
remove(name: string): void
list(): string[]
shutdownAll(): Promise<void>
```

## Shutdown Contract

Services may optionally implement:

```
shutdown(): Promise<void>
close(): Promise<void>
```

If both methods are absent, the registry will log a warning.

## Failure Handling

If one service fails during shutdown:

- the error is logged
- remaining services are still shutdown

---

# Controller Contract

Location:

```
src/core/controllers
```

Controllers define HTTP request handlers.

## Requirements

Controllers must be classes.

Example:

```
class UserController {

  async getUser(req, res) {
    ...
  }

}
```

## Handler Signature

```
(req, res, next?)
```

Handlers may return:

```
Promise<void>
```

Controllers should remain stateless.

Dependencies should be obtained from the ServiceRegistry.

---

# Scheduler Job Contract

Location:

```
src/lib/scheduler
```

Scheduler jobs must export an asynchronous function.

Example:

```
export async function run(ctx) {
  ...
}
```

## Job Context

The context may include:

```
config
services
eventBus
logger
```

## Execution Rules

Jobs must:

- be idempotent where possible
- not block the event loop
- handle their own errors

Errors should be emitted via the EventBus.

---

# WebSocket Event Contract

Location:

```
src/lib/websocket
```

The WebSocket layer integrates with the EventBus.

## Connection Events

```
expresto.websocket.connected
expresto.websocket.disconnected
```

Payload example:

```
{
  socketId: string
  userId?: string
}
```

## Authentication

Token sources:

```
handshake.auth.token
query.token
Authorization header
```

Implementations must treat missing tokens as unauthorized connections.

---

# Configuration Contract

Location:

```
src/config
```

The configuration object is available throughout the framework.

## Requirements

Configuration must be:

```
immutable after startup
serializable
validated during initialization
```

Sensitive values must be redacted when exposed via:

```
/__config endpoint
```

---

# Stability Rules

Framework contracts follow these stability rules.

### Patch releases

```
no contract changes
```

### Minor releases

```
additive contract changes allowed
```

### Major releases

```
breaking changes allowed
```

Any contract changes must be documented in the release notes.

---

# Internal vs Public Contracts

Not every internal interface is a stable contract.

Stable contracts include:

```
EventBus API
Hook system
ServiceRegistry API
Controller interface
Scheduler job interface
```

Internal implementation details may change without notice.

---

# Summary

Framework contracts define the stable boundaries between components.

They enable:

- predictable behavior
- safe extension points
- long-term maintainability

When modifying the framework always verify whether the change affects a
contract defined in this document.
