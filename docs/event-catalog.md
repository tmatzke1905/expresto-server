

# Expresto Event Catalog

This document lists all internal framework events emitted by Expresto.

The purpose of this catalog is to provide:

- a stable reference for developers
- integration points for plugins and extensions
- observability hooks for monitoring systems
- clear guidance for coding agents

All events follow the naming scheme:

```
expresto.<domain>.<event>
```

Example:

```
expresto.websocket.connected
```

---

# Event Naming Rules

Event names must follow these rules:

1. Lowercase
2. Dot separated
3. Domain based

```
expresto.<module>.<action>
```

Examples:

```
expresto.websocket.connected
expresto.scheduler.job.start
expresto.security.authorize
```

---

# Common Payload Structure

Events should follow a consistent payload structure when possible:

```
{
  ts: string        // ISO timestamp
  source?: string   // emitting module
  context?: object  // optional contextual data
}
```

Example:

```
{
  ts: "2025-01-01T12:00:00.000Z",
  source: "scheduler",
  context: {
    job: "cleanup"
  }
}
```

---

# WebSocket Events

### expresto.websocket.connected

Emitted when a client successfully connects.

Payload:

```
{
  ts: string
  source?: string
  context?: object
  socketId: string
  auth?: unknown
}
```

---

### expresto.websocket.disconnected

Emitted when a client disconnects.

Payload:

```
{
  ts: string
  source?: string
  context?: object
  socketId: string
  reason?: string
}
```

---

### expresto.websocket.error

Emitted when a WebSocket error occurs.

Payload:

```
{
  ts: string
  source?: string
  context?: object
  socketId?: string
  error: Error
}
```

---

# Scheduler Events

### expresto.scheduler.started

Emitted when the scheduler starts.

Payload:

```
{
  ts: string
  source?: string
  context?: object
}
```

---

### expresto.scheduler.job.start

Emitted when a scheduled job begins execution.

Payload:

```
{
  ts: string
  source?: string
  context?: object
  job: string
}
```

---

### expresto.scheduler.job.success

Emitted when a job finishes successfully.

Payload:

```
{
  ts: string
  source?: string
  context?: object
  job: string
  durationMs: number
}
```

---

### expresto.scheduler.job.error

Emitted when a job fails.

Payload:

```
{
  ts: string
  source?: string
  context?: object
  job: string
  durationMs: number
  error: unknown
}
```

---

### expresto.scheduler.stopped

Emitted when the scheduler shuts down.

Payload:

```
{
  ts: string
  source?: string
  context?: object
}
```

---

# Security Events

### expresto.security.authorize

Emitted when an authorization check occurs.

Payload:

```
{
  ts: string
  source?: string
  context?: object
  mode: "none" | "basic" | "jwt"
  method: string
  path: string
  route: string
  controller: string
  result: "allowed" | "denied"
  status?: number
  error?: string
}
```

---

# Ops Events

Operational endpoints may emit events for observability.

### expresto.ops.*

Operational endpoints emit:

```
expresto.ops.health_read
expresto.ops.routes_read
expresto.ops.config_read
expresto.ops.config_error
expresto.ops.logs_read
expresto.ops.logs_error
expresto.ops.logs_not_found
```

All payloads follow:

```
{
  ts: string
  source?: string
  context?: object
  ...eventSpecificFields
}
```

---

# Service Registry Events

### expresto.services.registered
### expresto.services.set
### expresto.services.removed
### expresto.services.shutdown.started
### expresto.services.shutdown.success
### expresto.services.shutdown.skipped
### expresto.services.shutdown.error
### expresto.services.shutdown.completed

Payload:

```
{
  ts: string
  source?: string
  context?: object
  ...eventSpecificFields
}
```

---

# Future Events

The following domains may introduce additional events:

```
expresto.metrics.*
expresto.cluster.*
expresto.database.*
```

New events must be documented in this file.

---

# Guidelines for Developers

When introducing new events:

1. Follow the naming convention
2. Document the event here
3. Provide a stable payload structure
4. Avoid breaking existing payload contracts

Events are part of the public extension interface of the framework.

Treat them as a stable API.

---

# Summary

The EventBus enables loose coupling between modules.

Typical consumers:

- monitoring systems
- plugins
- scheduler jobs
- WebSocket bridges

Always keep this catalog up to date when adding new events.
