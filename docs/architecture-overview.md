

# Expresto Architecture Overview

This document provides a high-level overview of the Expresto framework architecture.

It is intended to help developers quickly understand how the core components interact
and how requests, events, and services flow through the system.

Status note:

- this is a background architecture document, not the source of truth for the
  supported npm API
- it may mention roadmap ideas or historical hook names
- use `docs/public-api.md`, `docs/framework-contracts.md`, and
  `docs/lifecycle-hooks.md` for the supported v1 runtime contract

---

# Core Concepts

Expresto is built around a small set of core architectural building blocks:

- **Router** – HTTP request routing
- **Controllers** – endpoint implementations
- **Hooks** – lifecycle extension points
- **Services** – infrastructure components with lifecycle management
- **EventBus** – asynchronous internal communication
- **Scheduler** – background job execution
- **WebSocket Manager** – real-time communication layer

These components are loosely coupled using the EventBus and the ServiceRegistry.

---

# High-Level Runtime Architecture

```
               +-------------------+
               |     HTTP Server   |
               |      (Express)    |
               +---------+---------+
                         |
                         v
                 +-------+-------+
                 |     Router    |
                 +-------+-------+
                         |
                         v
                 +-------+-------+
                 |   Controllers  |
                 +-------+-------+
                         |
                         v
                +--------+--------+
                |   Lifecycle     |
                |      Hooks      |
                +--------+--------+
                         |
                         v
                  +------+------+
                  |   Services   |
                  | (Registry)   |
                  +------+------+
                         |
                         v
                   +-----+-----+
                   |  EventBus  |
                   +-----+-----+
                         |
      +------------------+------------------+
      |                                     |
      v                                     v
+-----------+                         +--------------+
| Scheduler |                         |  WebSockets  |
+-----------+                         +--------------+
```

---

# Request Lifecycle

The following sequence illustrates the lifecycle of an HTTP request.

```
Client Request
     |
     v
Express Server
     |
     v
Router
     |
     v
Controller
     |
     v
Security Hooks
     |
     v
Business Logic
     |
     v
Response
```

Hooks allow projects to inject behavior into the lifecycle without modifying
framework internals.

---

# Lifecycle Hooks

Hooks are the main extension mechanism of the framework.

Examples:

```
INITIALIZE
BEFORE_STARTUP
AFTER_STARTUP
BEFORE_SHUTDOWN
```

Hooks allow projects to:

- initialize infrastructure
- register services
- load configuration
- attach middleware

Hooks are executed through the HookManager.

---

# Service Registry

Infrastructure components are managed by the ServiceRegistry.

Examples of services:

```
database pools
message queues
scheduler
websocket manager
cache systems
```

Services are registered during startup and shut down during application termination.

Example:

```
registry.register("scheduler", schedulerService)
```

Shutdown process:

```
registry.shutdownAll()
```

The registry ensures graceful shutdown of all infrastructure components.

---

# EventBus

The EventBus provides asynchronous communication between framework modules.

Key properties:

- loosely coupled architecture
- async event dispatch
- internal observability

Example usage:

```
eventBus.emit("expresto.websocket.connected", payload)
```

Typical consumers:

- monitoring systems
- plugins
- scheduler jobs
- websocket bridges

All framework events are documented in:

```
docs/event-catalog.md
```

---

# Scheduler

The scheduler executes background jobs based on cron expressions.

Features:

- asynchronous execution
- configurable job modules
- EventBus integration

Example job configuration:

```
{
  "cron": "*/5 * * * *",
  "module": "./jobs/cleanup"
}
```

The scheduler emits lifecycle events for observability.

---

# WebSocket Layer

The WebSocketManager integrates real-time communication using Socket.IO.

Features:

- JWT authentication
- handshake token support
- EventBus integration

Connection lifecycle:

```
client connects
       |
       v
JWT verification
       |
       v
socket context created
       |
       v
connection registered
       |
       v
EventBus event emitted
```

Events:

```
expresto.websocket.connected
expresto.websocket.disconnected
```

---

# Security System

Authentication and authorization are implemented using hooks and metadata.

Authentication sources:

```
Authorization header
query.token
auth.token
```

Authorization decisions may emit events such as:

```
expresto.security.authorize
```

Security logic remains customizable for projects using the framework.

---

# Configuration System

Configuration is loaded during the startup phase and can originate from:

```
configuration files
environment variables
external configuration providers
```

Configuration may be exposed via the ops endpoint:

```
/__config
```

Sensitive values are redacted before exposure.

---

# Operational Endpoints

Operational endpoints expose diagnostic information.

Examples:

```
/__health
/__routes
/__config
/__logs
```

These endpoints help with:

- debugging
- monitoring
- operational visibility

---

# Design Goals

Expresto follows several core design principles:

### Simplicity

Avoid unnecessary abstractions and keep components understandable.

### Modularity

Subsystems should remain loosely coupled.

### Observability

Events and logs should provide insight into runtime behavior.

### Extensibility

Projects must be able to extend the framework without modifying core code.

---

# Summary

Expresto is designed as a lightweight, modular backend framework
focused on predictable runtime behavior and clean extension points.

Core pillars:

```
Router
Controllers
Hooks
ServiceRegistry
EventBus
Scheduler
WebSockets
Security
```

Together these components form the runtime architecture of the framework.

Refer to the detailed documentation for each subsystem in the `docs/` directory.
