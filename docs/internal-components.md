

# Expresto Internal Components

This document describes the most important internal runtime components of the
Expresto framework.

It is intended for developers who want to understand or extend the framework
itself.

---

# Overview

The Expresto runtime consists of several cooperating internal modules.

```
Router
HookManager
EventBus
ServiceRegistry
SchedulerService
WebSocketManager
SecurityProvider
OpsController
```

Each component has a clearly defined responsibility.

---

# Router

Location:

```
src/core/router
```

The router is responsible for mapping incoming HTTP requests to controller
methods.

Responsibilities:

- resolve HTTP method
- resolve route path
- extract route parameters
- dispatch request to the controller

Example:

```
GET /users/:id
```

Resolved controller:

```
UserController.getUser()
```

The router should remain lightweight and deterministic.

---

# HookManager

Location:

```
src/lib/hooks.ts
```

The HookManager controls the execution of lifecycle hooks.

Hooks are the primary extension mechanism of the framework.

Typical hooks include:

```
INITIALIZE
BEFORE_STARTUP
AFTER_STARTUP
BEFORE_SHUTDOWN
```

Responsibilities:

- register hook handlers
- execute hooks in deterministic order
- propagate execution context

Example:

```
hookManager.on('INITIALIZE', async ctx => {
  // initialize infrastructure
})
```

---

# EventBus

Location:

```
src/lib/events.ts
```

The EventBus provides asynchronous communication between internal modules.

Supported operations:

```
on(event, handler)
off(event, handler)
emit(event, payload)
emitAsync(event, payload)
```

The EventBus enables a loosely coupled architecture.

Typical use cases:

- internal observability
- plugin integration
- cross-module communication

Example:

```
eventBus.emit('expresto.websocket.connected', payload)
```

---

# ServiceRegistry

Location:

```
src/services/service-registry.ts
```

The ServiceRegistry manages infrastructure services used by the framework.

Examples:

```
database connection pools
cache clients
message queues
scheduler
websocket manager
```

Responsibilities:

- register services
- provide service lookup
- manage lifecycle
- perform graceful shutdown

Example:

```
registry.register('scheduler', schedulerService)
```

Shutdown procedure:

```
registry.shutdownAll()
```

Services should implement one of the following methods:

```
shutdown()
close()
```

---

# SchedulerService

Location:

```
src/lib/scheduler
```

The scheduler executes background jobs based on cron expressions.

Features:

- asynchronous job execution
- cron scheduling
- job isolation
- EventBus integration

Example configuration:

```
{
  "cron": "*/5 * * * *",
  "module": "./jobs/cleanup"
}
```

The scheduler emits events such as:

```
expresto.scheduler.job.start
expresto.scheduler.job.success
expresto.scheduler.job.error
```

---

# WebSocketManager

Location:

```
src/lib/websocket
```

The WebSocketManager provides real-time communication using Socket.IO.

Responsibilities:

- manage client connections
- authenticate connections
- emit connection lifecycle events

Authentication sources:

```
handshake.auth.token
query.token
Authorization header
```

Events emitted:

```
expresto.websocket.connected
expresto.websocket.disconnected
```

The WebSocketManager integrates with the EventBus to allow plugins
and other modules to react to connection events.

---

# SecurityProvider

Location:

```
src/lib/security
```

The SecurityProvider implements authentication and authorization support.

Typical responsibilities:

- JWT validation
- attaching user context
- authorization checks

Security logic can be extended using hooks and controller metadata.

Example:

```
@RequireRole('admin')
```

Security events may be emitted via the EventBus.

---

# OpsController

Location:

```
src/core/ops
```

The OpsController exposes operational endpoints for diagnostics.

Endpoints include:

```
/__health
/__routes
/__config
/__logs
```

Responsibilities:

- runtime diagnostics
- operational visibility
- debugging support

Sensitive information must be redacted before returning responses.

---

# Interaction Between Components

The components interact through two primary mechanisms:

```
ServiceRegistry
EventBus
```

Example interaction:

```
Scheduler
   │
   ▼
EventBus event
   │
   ▼
WebSocketManager or plugins
```

This architecture avoids tight coupling between modules.

---

# Design Principles

Internal components follow these principles:

### Deterministic behavior

Framework behavior should be predictable and easy to reason about.

### Loose coupling

Components communicate through the EventBus instead of direct dependencies.

### Observability

Important lifecycle events should be emitted through the EventBus.

### Extensibility

Projects should be able to extend the framework without modifying
core components.

---

# Summary

The internal architecture of Expresto is built around a small set
of modular runtime components:

```
Router
HookManager
EventBus
ServiceRegistry
SchedulerService
WebSocketManager
SecurityProvider
OpsController
```

Understanding these components helps developers extend or debug
the framework effectively.

Refer to the other documentation files in `docs/` for more details.
