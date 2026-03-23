# Expresto Architecture Decisions (ADR)

This document records important architectural decisions made during the
creation of the Expresto framework.

Architecture Decision Records (ADR) explain **why the system was designed the
way it is**.

They are important because over time developers forget the original reasoning
behind design choices.

Status note:

- ADRs may discuss roadmap ideas and historical designs that are not yet part
  of the supported release surface
- for current supported behavior, use `docs/public-api.md`,
  `docs/framework-contracts.md`, and the topic-specific runtime docs

Each decision record contains:

- context
- decision
- consequences

---

# ADR‑001 — EventBus as the Backbone of the Runtime

## Context

Many parts of the framework must communicate with each other:

- Scheduler
- WebSocket layer
- Metrics
- Logging
- Plugins

Direct dependencies between these components would create tight coupling.

Tightly coupled systems are harder to extend and test.

## Decision

Introduce a central **EventBus** for asynchronous communication.

Core API:

```
on(event, handler)
off(event, handler)
emit(event, payload)
emitAsync(event, payload)
```

Framework subsystems emit domain events.

Other modules subscribe to these events.

Example:

```
eventBus.emit("expresto-server.websocket.connected", payload)
```

## Consequences

Advantages:

- loose coupling between modules
- easy observability
- plugins can react to framework events

Trade-offs:

- debugging event flows can be harder
- event contracts must remain stable

---

# ADR‑002 — Hooks Instead of Guards

## Context

Initially the framework considered a **guard system** similar to frameworks
like NestJS.

Guards typically intercept requests and apply logic such as authentication or
validation.

However guards are often tightly coupled to the HTTP request pipeline.

## Decision

Use a **hook system** instead of guards.

Hooks allow extensions at different lifecycle phases:

```
INITIALIZE
STARTUP
PRE_INIT
CUSTOM_MIDDLEWARE
POST_INIT
SHUTDOWN
SECURITY
```

Hooks operate at the **framework lifecycle level**, not just the HTTP layer.

## Consequences

Advantages:

- hooks apply to the entire runtime
- easier plugin integration
- consistent lifecycle extension points

Trade-offs:

- less fine-grained request interception compared to guard pipelines

---

# ADR‑003 — ServiceRegistry for Infrastructure

## Context

Applications typically depend on external infrastructure:

- databases
- caches
- message queues
- search engines

Without a central registry these services become scattered across the codebase.

## Decision

Introduce a **ServiceRegistry** responsible for managing infrastructure
services.

Responsibilities:

- register services
- provide lookup
- coordinate shutdown

Example:

```
services.register("database", dbPool)
```

## Consequences

Advantages:

- consistent access to infrastructure
- centralized lifecycle management
- easier testing

Trade-offs:

- services become indirectly coupled through the registry

---

# ADR‑004 — Plugin System Built on Existing Primitives

## Context

Many frameworks introduce complex plugin systems with dedicated runtime
layers.

This often increases complexity and creates additional maintenance burden.

## Decision

Design the plugin system using existing primitives:

```
EventBus
Hooks
ServiceRegistry
```

Plugins simply receive the runtime context and compose these primitives.

For the first supported release, the plugin system remains roadmap-only.
The current v1 surface exposes the primitives above, but not a stable plugin
loader or plugin configuration contract.

Example:

```
export default async function plugin(ctx) {

  ctx.eventBus.on("expresto-server.websocket.connected", handler)

}
```

## Consequences

Advantages:

- minimal additional runtime complexity
- plugins remain lightweight
- framework core stays small

Trade-offs:

- plugins must understand framework primitives

---

# ADR‑005 — Event‑Driven Observability

## Context

Observability is often added late in projects and requires invasive code
changes.

## Decision

Emit important runtime events through the EventBus.

Examples:

```
expresto-server.websocket.connected
expresto-server.scheduler.job.success
expresto-server.scheduler.job.error
expresto-server.startup.complete
```

Monitoring systems can subscribe to these events.

## Consequences

Advantages:

- observability without modifying core logic
- plugins can collect metrics
- logging becomes event‑driven

Trade-offs:

- event volume must be controlled

---

# ADR‑006 — Scheduler as a First‑Class Subsystem

## Context

Background jobs are a common requirement for backend systems.

Typical examples:

- cleanup jobs
- batch processing
- data synchronization

Many frameworks delegate scheduling to external tools.

## Decision

Include a built‑in scheduler service.

Jobs are configured via cron expressions and loaded dynamically.

Example:

```
{
  "cron": "*/5 * * * *",
  "module": "./jobs/cleanup"
}
```

## Consequences

Advantages:

- unified runtime for HTTP and background jobs
- consistent service access
- observability through EventBus

Trade-offs:

- scheduler adds runtime complexity

---

# ADR‑007 — WebSocket Integration as Core Infrastructure

## Context

Real‑time features are increasingly common in modern applications.

Examples:

- live dashboards
- collaborative tools
- notifications

## Decision

Provide built‑in WebSocket support using Socket.IO.

The WebSocket manager integrates with:

- EventBus
- authentication
- ServiceRegistry

Connection lifecycle events are emitted.

Example:

```
expresto-server.websocket.connected
expresto-server.websocket.disconnected
```

## Consequences

Advantages:

- real‑time features integrated with the framework
- consistent authentication
- observability through events

Trade-offs:

- additional runtime dependencies

---

# ADR‑008 — Documentation as a First‑Class Feature

## Context

Many frameworks accumulate documentation over time in an unstructured
manner.

This leads to outdated or inconsistent docs.

## Decision

Maintain a structured documentation set covering:

```
architecture
runtime lifecycle
subsystems
contracts
plugin system
```

Documentation is stored in the repository and evolves with the codebase.

## Consequences

Advantages:

- easier onboarding
- clearer architectural intent
- long‑term maintainability

Trade-offs:

- documentation must be actively maintained

---

# ADR‑009 — Clustered Runtime Uses a Local Primary/Worker Model

## Context

`cluster.enabled` started as a placeholder flag, but operational users need a
real supported multi-process runtime.

At the same time, expresto-server should not over-promise features that require
additional distributed infrastructure.

In particular:

- HTTP request handling can be scaled locally with worker processes
- attached scheduler execution must stay singleton
- clustered WebSockets would require a supported adapter and sticky-session
  policy
- ops and metrics responses must not pretend to be globally aggregated when
  they are emitted by one worker

## Decision

Adopt a conservative local primary/worker clustering model:

- the primary process supervises worker lifecycle only
- workers run the normal HTTP runtime
- attached scheduler jobs run on exactly one leader worker
- worker-local ops and metrics responses expose cluster metadata explicitly
- clustered WebSockets are rejected until a supported adapter strategy exists

## Consequences

Advantages:

- real multi-process scaling without changing the `createServer()` contract
- deterministic scheduler ownership inside the local cluster
- clear operational story for worker restarts and shutdown
- unsupported WebSocket clustering fails fast instead of degrading silently

Trade-offs:

- metrics remain worker-local unless aggregated externally
- the clustered runtime is intentionally scoped to local multi-core execution
- WebSockets require a single-worker runtime for now

---

# Summary

These decisions define the core philosophy of the Expresto framework:

```
event-driven architecture
hook-based extensibility
service-oriented infrastructure
built-in observability
```

Future changes should respect these principles unless a new ADR replaces
them.
