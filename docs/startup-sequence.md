

# Expresto Startup Sequence

This document describes the startup lifecycle of the Expresto framework.

Understanding this sequence helps developers know:

- when configuration becomes available
- when services can be registered
- when hooks execute
- when the HTTP server becomes reachable

The startup pipeline is deterministic and hook‑driven.

---

# High Level Startup Flow

```
Process start
   │
   ▼
Load configuration
   │
   ▼
Create core runtime components
   │
   ▼
INITIALIZE hook
   │
   ▼
Register infrastructure services
   │
   ▼
BEFORE_STARTUP hook
   │
   ▼
Start internal services
   │
   ▼
Create HTTP server
   │
   ▼
Register routes and controllers
   │
   ▼
Start WebSocket layer
   │
   ▼
Start Scheduler
   │
   ▼
AFTER_STARTUP hook
   │
   ▼
HTTP server begins listening
```

---

# Step 1 — Process Start

The Node.js process starts and the framework entry point is executed.

Typical entry file:

```
src/index.ts
```

Responsibilities:

- initialize runtime
- prepare dependency graph

---

# Step 2 — Configuration Load

Configuration is loaded before any services start.

Possible configuration sources:

```
configuration files
environment variables
external configuration providers
```

At this stage the configuration object becomes available to the
startup context.

Example:

```
const config = loadConfig()
```

---

# Step 3 — Core Runtime Creation

Core runtime components are instantiated:

```
EventBus
HookManager
ServiceRegistry
Logger
```

These components form the backbone of the framework runtime.

They are injected into the application context.

---

# Step 4 — INITIALIZE Hook

The `INITIALIZE` hook is executed.

Purpose:

- early infrastructure initialization
- configuration post‑processing
- environment preparation

Example:

```
hookManager.on("INITIALIZE", async ctx => {
  // initialize configuration providers
})
```

Typical tasks:

- load secrets
- connect to configuration services
- validate configuration

---

# Step 5 — Service Registration

Infrastructure services are registered in the ServiceRegistry.

Examples:

```
database pools
cache clients
message queues
external APIs
```

Example:

```
services.register("database", dbClient)
```

Services registered here become available to controllers and jobs.

---

# Step 6 — BEFORE_STARTUP Hook

The `BEFORE_STARTUP` hook runs after services are registered
but before the HTTP server starts.

Purpose:

- finalize infrastructure
- warm up services
- perform readiness checks

Example:

```
hookManager.on("BEFORE_STARTUP", async ctx => {
  await ctx.services.get("database").ping()
})
```

If an error occurs during this phase the application should abort startup.

---

# Step 7 — Start Internal Services

Internal runtime services may start here.

Examples:

```
SchedulerService
WebSocketManager
Metrics collectors
```

These services integrate with the EventBus and ServiceRegistry.

---

# Step 8 — HTTP Server Creation

The Express application is created.

Example:

```
const app = express()
```

Responsibilities:

- create HTTP server
- attach middleware
- configure request parsing

---

# Step 9 — Route Registration

Controllers and routes are registered with the router.

Example:

```
router.registerController(UserController)
```

Responsibilities:

- map HTTP routes
- bind controller handlers
- configure routing metadata

---

# Step 10 — WebSocket Initialization

The WebSocketManager attaches to the HTTP server.

Example:

```
new WebSocketManager(server, config, logger, eventBus, services)
```

Responsibilities:

- initialize Socket.IO
- configure authentication
- emit connection lifecycle events

---

# Step 11 — Scheduler Startup

The scheduler loads job definitions and begins scheduling tasks.

Example configuration:

```
{
  "scheduler": {
    "jobs": [
      {
        "cron": "*/5 * * * *",
        "module": "./jobs/cleanup"
      }
    ]
  }
}
```

Scheduler events are emitted via the EventBus.

---

# Step 12 — AFTER_STARTUP Hook

The `AFTER_STARTUP` hook runs after all subsystems are ready.

Purpose:

- notify plugins
- perform post‑startup actions
- trigger readiness signals

Example:

```
hookManager.on("AFTER_STARTUP", async ctx => {
  ctx.logger.app.info("Application fully started")
})
```

---

# Step 13 — Server Listening

Finally the HTTP server begins listening for incoming connections.

Example:

```
server.listen(port)
```

At this point the application is fully operational.

---

# Failure Handling

If an error occurs during startup:

```
INITIALIZE
BEFORE_STARTUP
service initialization
```

The framework should:

1. log the error
2. stop the startup process
3. shutdown initialized services

Example shutdown procedure:

```
await services.shutdownAll()
```

This guarantees consistent system state.

---

# Observability During Startup

Startup events may be logged or emitted via the EventBus.

Possible events:

```
expresto.startup.begin
expresto.startup.services.ready
expresto.startup.complete
```

These events allow monitoring systems to track boot progress.

---

# Summary

The Expresto startup pipeline ensures predictable initialization of
all runtime components.

Startup phases:

```
configuration
→ runtime creation
→ INITIALIZE hook
→ service registration
→ BEFORE_STARTUP hook
→ internal services
→ HTTP server
→ routing
→ websocket layer
→ scheduler
→ AFTER_STARTUP hook
→ server.listen
```

This sequence guarantees that infrastructure and services are ready
before the system begins processing requests.
