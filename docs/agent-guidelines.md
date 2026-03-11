

# Expresto – Agent Guidelines

This document defines architectural and coding rules for automated coding agents
(Codex, ChatGPT, etc.) working inside the Expresto repository.

Agents must follow these guidelines to keep the framework consistent.

---

# 1. General Principles

Agents must follow these rules:

- Do NOT break existing public APIs.
- Always update tests when behavior changes.
- Keep the framework modular.
- Prefer simple, predictable designs.
- Avoid hidden side effects.

When modifying code:

1. Check tests
2. Update documentation
3. Ensure backward compatibility

---

# 2. Project Structure

The project follows a strict structure.

```
src/
  core/
  lib/
  services/
  hooks/
  types/

docs/
  architecture/

 tests/
```

Rules:

- `core` → framework runtime features
- `lib` → reusable components
- `services` → lifecycle-managed systems
- `hooks` → lifecycle extensions
- `types` → public type definitions

Agents must NOT randomly introduce new top‑level folders.

---

# 3. EventBus Rules

The EventBus is the central internal communication system.

Allowed methods:

```
on(event, handler)
off(event, handler)
emit(event, payload)
emitAsync(event, payload)
```

Naming rules for events:

```
expresto.*
expresto.websocket.*
expresto.scheduler.*
expresto.ops.*
expresto.security.*
```

Example:

```
expresto.websocket.connected
expresto.websocket.disconnected
expresto.scheduler.job.start
expresto.scheduler.job.success
```

Payload structure should be predictable:

```
{
  ts: string,
  source?: string,
  context?: object
}
```

Events must always be emitted asynchronously if handlers may perform I/O.

---

# 4. Scheduler Rules

The scheduler executes cron-based jobs.

Rules:

- Jobs must run asynchronously
- Jobs must not block the event loop
- Jobs receive a context object

Job context:

```
{
  logger,
  services,
  eventBus,
  config
}
```

Scheduler must emit events:

```
expresto.scheduler.started
expresto.scheduler.job.start
expresto.scheduler.job.success
expresto.scheduler.job.error
expresto.scheduler.stopped
```

Agents must not introduce blocking code inside scheduler tasks.

---

# 5. WebSocket Rules

The WebSocketManager integrates real‑time connections.

Authentication sources:

```
handshake.auth.token
query.token
Authorization header
```

Connection context should expose:

```
socket.context.user
socket.context.token
socket.context.requestId
```

Required events:

```
expresto.websocket.connected
expresto.websocket.disconnected
expresto.websocket.error
```

---

# 6. Service Registry Rules

The ServiceRegistry manages lifecycle of infrastructure services.

Rules:

- Services must be registered explicitly
- Services should implement one of:

```
shutdown()
close()
```

If neither exists:

→ a warning must be logged

Services should be stopped during shutdown using:

```
shutdownAll()
```

Agents must ensure services shut down gracefully.

---

# 7. Security System

Authentication and authorization is implemented using hooks.

Hook pipeline:

```
beforeAuth
afterAuth
beforeAuthorize
afterAuthorize
```

Authorization events may be emitted:

```
expresto.security.authorize
```

Agents must not embed project‑specific auth logic into the framework.

---

# 8. Ops Controller

Operational endpoints provide runtime diagnostics.

Endpoints:

```
/__health
/__routes
/__config
/__logs
```

Rules:

- Sensitive configuration must be redacted
- Endpoints must never expose secrets
- Response structures must stay stable

---

# 9. Logging Rules

Logging should be structured.

Preferred fields:

```
requestId
service
module
duration
```

Agents must not introduce excessive logging noise.

---

# 10. Testing Requirements

Every behavioral change requires tests.

Test framework:

```
vitest
```

Coverage targets:

```
> 90%
```

Critical areas requiring tests:

- EventBus
- Scheduler
- WebSocket authentication
- ServiceRegistry shutdown
- Ops endpoints

---

# 11. Coding Style

Preferred style:

- async/await
- explicit typing
- minimal abstractions

Avoid:

- unnecessary dependency injection
- magic behavior
- global state

---

# 12. Documentation

When code behavior changes:

Agents must update documentation in:

```
docs/architecture/
```

Relevant files include:

```
event-system.md
scheduler.md
lifecycle-hooks.md
websocket.md
```

---

# Summary

Agents working on Expresto must:

1. Preserve architecture
2. Maintain backward compatibility
3. Extend the EventBus consistently
4. Add tests for behavioral changes
5. Update documentation when necessary

The goal is a clean, modular, predictable framework.
