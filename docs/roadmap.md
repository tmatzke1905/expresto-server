# Current Focus

## Release Readiness Packages

This roadmap lists the remaining open packages.

Package numbers stay stable as package IDs for planning and branch mapping. The
active execution order is defined explicitly below.

The completed beta-foundation packages were removed from the active roadmap for
clarity. Their outcomes are already reflected in the codebase, release notes,
and supporting documentation.

Each open package should be implemented in a dedicated branch and should not be
split across multiple branches unless explicitly required.

Execution rule for release work:

- Finish one package completely before starting the next.
- Keep code changes, tests, and documentation updates in the same branch.
- Merge only after the listed verification steps are green.
- If scope needs to be reduced, update README and `docs/` in the same package.
- Always generate a commit message

## Stabilization Package (Post-beta, Pre-1.0.0)

The first public npm prerelease is `1.0.0-beta`. The current follow-up
prerelease for continued validation is `1.1.0-beta`. The release plan has
been updated so that Package 4 is implemented next and becomes part of the
stable `1.0.0` path. Package 1 follows immediately after it and closes the
stable-release gate with a public example app.

### Package 4 — WebSocket Extension API

Branch: `codex/feature-04-websocket-extension-api`

Goal: Introduce a deliberate developer-facing WebSocket extension surface before
the first stable release, or explicitly document why it stays internal.

Checklist:

- [x] Decide whether a public accessor such as `getSocketServer()` is actually
      part of the supported API.
- [x] If supported, export a stable runtime access pattern for Socket.IO after
      server startup.
- [x] Define timing rules for when the WebSocket server is available and how
      non-listening or test runtimes should behave.
- [x] Add tests for access before/after startup, auth context propagation, and
      custom event registration.
- [x] Update `docs/websocket.md`, README, and public API docs to match the
      chosen contract.

Verification:

- [x] Public WebSocket access is covered by tests or explicitly documented as unsupported
- [x] No docs mention private/internal access patterns anymore

### Package 1 — Example App and Integration Starter

Branch: `codex/feature-01-example-app-starter`

Goal: Give adopters a realistic reference project for the supported v1 API,
including the supported WebSocket surface, and close the stable-release gate.

Checklist:

- [ ] Create a small example app that consumes the published `expresto-server@1.1.0-beta`
      package only, not repo-internal imports.
- [ ] Demonstrate the supported controller contract, auth, ops, scheduler, and
      supported WebSocket setup.
- [ ] Decide whether the database facade belongs inside this repository or as a
      companion project; document the decision.
- [ ] Add smoke checks for the example app startup path and basic requests.
- [ ] Update README and docs to point new users to the example.

Verification:

- [ ] Example app runs from the published beta package surface
- [ ] Docs reference the example as the canonical starting point
- [ ] Integration guidance no longer depends on private repo structure

## Deferred Feature Packages (Post-1.0.0)

The following feature areas remain intentionally **not** part of the first
stable production release. They should only be started after Packages 4 and 1
are finished and `1.0.0` has been shipped, or once the release plan has been
explicitly changed.

Status note:

- Package 2 has now been implemented on its dedicated branch ahead of the
  originally recommended execution order.
- The remaining packages in this section stay deferred until the release plan
  changes explicitly.

### Package 2 — Real Clustering Support

Branch: `codex/feature-02-clustering-runtime`

Goal: Turn the current `cluster.enabled` placeholder into a real, supported
multi-process runtime.

Checklist:

- [x] Decide the supported cluster model for v2
      (primary/worker, local multi-core only, or extensible abstraction).
- [x] Implement real bootstrap behavior when `cluster.enabled === true` instead
      of treating the flag only as a scheduler constraint.
- [x] Define how ops endpoints, metrics, WebSockets, and scheduler behavior work
      across workers.
- [x] Implement graceful worker shutdown and restart strategy.
- [x] Add tests for clustered startup, shutdown, worker lifecycle, and
      incompatible mode combinations.
- [x] Update `docs/clustering.md`, `docs/configuration.md`,
      `docs/startup-sequence.md`, and relevant WebSocket/scheduler docs.

Verification:

- [x] Cluster bootstrap works in an automated integration test
- [x] Shutdown behavior is documented and tested
- [x] Unsupported combinations fail with clear startup errors

### Package 3 — Supported Plugin System

Branch: `codex/feature-03-plugin-system`

Goal: Replace the current design-only plugin documentation with a real,
supported plugin contract.

Checklist:

- [ ] Decide the minimal supported plugin scope for the first plugin release
      (services, hooks, controllers, events, config extension).
- [ ] Extend config/schema with an explicit `plugins` contract if the feature is
      accepted.
- [ ] Implement plugin discovery, loading order, error handling, and rollback on
      startup failure.
- [ ] Define and export a stable plugin context built only from supported public
      API primitives.
- [ ] Add tests for plugin load order, failing plugins, hook participation, and
      service/controller registration.
- [ ] Update `docs/plugin-system.md`, `docs/versioning-policy.md`, README, and
      any public API docs.

Verification:

- [ ] Example plugin loads from config in an integration test
- [ ] Plugin startup failures abort safely without partial runtime state
- [ ] Plugin docs describe only implemented behavior

### Package 5 — Scheduler Reliability Extensions

Branch: `codex/feature-05-scheduler-reliability`

Goal: Add the operational controls needed for more demanding background job
workloads.

Checklist:

- [ ] Extend the scheduler config/schema for per-job timeout, retry, and backoff
      behavior.
- [ ] Implement timeout handling and retry execution with clear event emission.
- [ ] Define a leader-election or lock-provider contract for multi-instance job
      coordination.
- [ ] Add tests for timeout expiry, retry exhaustion, backoff behavior, and
      leader-only execution.
- [ ] Update `docs/scheduler.md`, `docs/configuration.md`, and event
      documentation.

Verification:

- [ ] Timeout and retry behavior is deterministic in tests
- [ ] Scheduler events cover new reliability outcomes
- [ ] Multi-instance coordination is either implemented or explicitly deferred

### Package 6 — Ops and Health Maturity

Branch: `codex/feature-06-ops-health-observability`

Goal: Evolve ops endpoints from basic diagnostics into a production-ready
observability surface.

Checklist:

- [ ] Define a health contributor contract for services and infrastructure
      dependencies.
- [ ] Add readiness/liveness detail and dependency status reporting without
      exposing secrets.
- [ ] Decide whether runtime log-level changes are supported; implement or
      remove the idea from docs.
- [ ] Extend metrics and ops documentation with the final production policy.
- [ ] Add tests for authenticated ops access, redaction, dependency health, and
      any mutating ops endpoints.

Verification:

- [ ] Health output is stable and documented
- [ ] Protected ops behavior remains fail-closed
- [ ] Observability docs match the real endpoint surface

### Recommended Merge Order

1. `codex/feature-04-websocket-extension-api`
2. `codex/feature-01-example-app-starter`
3. `codex/feature-02-clustering-runtime`
4. `codex/feature-03-plugin-system`
5. `codex/feature-05-scheduler-reliability`
6. `codex/feature-06-ops-health-observability`

## Agent Execution Order

Coding agents should implement the current focus areas in the following order:

1. WebSocket Extension API
2. Example App and Stable Release Gate
3. Real Clustering Support
4. Supported Plugin System
5. Scheduler Reliability Extensions
6. Ops and Health Maturity

Execution rules:

- Finish one focus area before starting the next.
- Do not work on multiple focus areas in the same branch.
- Use the matching `codex/*` branch for the active task.
- Run tests after each focus area is completed.
- Update documentation when behavior changes.
- If a significant architectural change is required, add a new ADR entry to `docs/design-decisions.md`.

# Expresto – Development Roadmap

This roadmap is written for both humans and coding agents (Codex, etc.).
Each task should be implemented without breaking existing public APIs unless explicitly stated.
The release packages above define the short-term execution order for the first
production-ready release; the thematic sections below remain the longer-term
backlog.

---

# Priority Overview

1. EventBus stabilization
2. WebSocket integration improvements
3. Scheduler events and reliability
4. Ops endpoints extensions
5. Service registry improvements
6. Security hook pipeline
7. Logging improvements
8. Test coverage
9. Example project
10. Database facade (separate project)

---

# 1. EventBus

Goal: Provide a consistent internal event system used by all modules.

Tasks:

- [x] Ensure API is stable

Required methods:

```
on(event, handler)
off(event, handler)
emit(event, payload)
emitAsync(event, payload)
```

- [x] Define naming convention

```
expresto-server.*
expresto-server.ops.*
expresto-server.websocket.*
expresto-server.scheduler.*
expresto-server.security.*
```

- [x] Define payload standard

```
{
  ts: string
  source?: string
  context?: object
}
```

- [x] Verify EventBus integration in:

```
ops-controller
websocket-manager
scheduler-service
security-provider
service-registry
```

---

# 2. WebSocket System

Goal: Stable real‑time communication layer with EventBus integration.

Tasks:

- [x] Emit lifecycle events

```
expresto-server.websocket.connected
expresto-server.websocket.disconnected
expresto-server.websocket.error
expresto-server.websocket.message
```

- [x] Improve handshake context

Socket context should contain:

```
socket.context.user
socket.context.token
socket.context.requestId
```

- [ ] Document websocket usage

File:

```
docs/architecture/websocket.md
```

Optional:

- [ ] WebSocket rate limiting

---

# 3. Scheduler

Goal: Reliable async cron‑based job execution.

Tasks:

- [x] Emit scheduler events

```
expresto-server.scheduler.started
expresto-server.scheduler.job.start
expresto-server.scheduler.job.success
expresto-server.scheduler.job.error
expresto-server.scheduler.stopped
```

- [ ] Add job timeout support

- [ ] Add job retry support

Example config:

```
{
  "scheduler": {
    "jobs": [
      {
        "cron": "* * * * *",
        "module": "./jobs/example",
        "timeout": 60000,
        "retry": 3
      }
    ]
  }
}
```

- [ ] Extend job context

```
context.logger
context.services
context.eventBus
context.config
```

---

# 4. Ops Controller

Goal: Operational endpoints for monitoring and debugging.

Existing endpoints:

```
/__health
/__routes
/__config
/__logs
```

Tasks:

- [ ] Add `/__services`

Response:

```
{
  "services": ["db", "redis", "scheduler"]
}
```

Optional:

- [ ] Add `/__metrics`

Metrics may include:

```
uptime
memory
event loop lag
request count
```

---

# 5. Service Registry

Goal: Central service lifecycle management.

Tasks:

- [ ] Support service dependencies

Example:

```
registry.register("redis", redisClient, { dependsOn: ["config"] })
```

- [ ] Track service status

```
starting
ready
failed
stopped
```

- [ ] Optional health checks

```
service.health()
```

---

# 6. Security System

Goal: Flexible authentication and authorization pipeline.

Tasks:

- [ ] Implement hook pipeline

```
beforeAuth
afterAuth
beforeAuthorize
afterAuthorize
```

- [ ] Resource authorization hook

```
expresto-server.security.authorize
```

- [ ] WebSocket authentication support

Token sources:

```
Authorization header
query.token
auth.token
```

---

# 7. Logging

Goal: Structured logging with operational visibility.

Tasks:

- [ ] Add dynamic log level endpoint

```
/__loglevel
```

- [ ] Add structured logging fields

```
requestId
service
module
duration
```

---

# 8. Test Coverage

Goal: >90% overall coverage, with at least 85% statements, functions, and
lines for release-ready code.

Add tests for:

```
eventBus
scheduler events
websocket events
service registry shutdown
security hooks
```

---

# 9. Example Project

Goal: Demonstrate full framework usage.

Project should include:

```
controller
websocket
scheduler job
security hook
service registry
```

---

# 10. Database Facade (separate project)

Goal: Unified interface for relational databases.

Supported drivers:

```
postgres
mysql
sqlite
mssql
```

Target API:

```
db.query()
db.transaction()
db.prepare()
db.pool()
```

---

# Branch Strategy

All work should be done on **dedicated topic branches**.
Neither humans nor coding agents should work directly on `main`.

Branch naming rules:

```
main                         -> stable branch
codex/<topic>                -> branch for coding-agent work
feature/<topic>              -> branch for manual feature work
fix/<topic>                  -> branch for bug fixes
refactor/<topic>             -> branch for non-functional internal cleanup
docs/<topic>                 -> branch for documentation-only work
```

Rules:

- Use `main` only as the protected integration branch.
- Use `codex/<topic>` when Codex or another coding agent implements a task.
- Use `feature/<topic>` for manual feature development.
- Use `fix/<topic>` for bug fixes.
- Use `refactor/<topic>` for internal cleanup without behavior changes.
- Use `docs/<topic>` for documentation-only changes.
- Open a pull request before merging into `main`.
- Delete merged topic branches afterwards.

## Recommended Branches for Current Roadmap

```
codex/eventbus-stabilization
codex/websocket-events
codex/scheduler-events
codex/ops-services-endpoint
codex/ops-metrics-endpoint
codex/service-registry-dependencies
codex/service-registry-status-tracking
codex/security-hook-pipeline
codex/websocket-auth-support
codex/logging-structured-fields
codex/test-coverage-increase
codex/example-project
codex/docs-synchronization
```

### Create Branches (Git Commands)

You can create all recommended branches using the following commands:

```
git checkout main

git checkout -b codex/eventbus-stabilization

git checkout -b codex/websocket-events

git checkout -b codex/scheduler-events

git checkout -b codex/ops-services-endpoint

git checkout -b codex/ops-metrics-endpoint

git checkout -b codex/service-registry-dependencies

git checkout -b codex/service-registry-status-tracking

git checkout -b codex/security-hook-pipeline

git checkout -b codex/websocket-auth-support

git checkout -b codex/logging-structured-fields

git checkout -b codex/test-coverage-increase

git checkout -b codex/example-project

git checkout -b codex/docs-synchronization
```

If the branches should also be pushed to the remote repository:

```
git push -u origin codex/eventbus-stabilization
```

Repeat for each branch as needed.

Agents should always work on the corresponding `codex/*` branch for the
specific task they are implementing.

Optional manual branches:

```
feature/database-facade-design
feature/database-facade-prototype
refactor/core-cleanup
docs/architecture-maintenance
```

Use one branch per task or per tightly related task group.
Avoid mixing unrelated changes in the same branch.

# Notes for Coding Agents

- Do not break existing public APIs unless explicitly required.
- Always add or update tests when changing behavior.
- Update documentation when module behavior changes.

---

# Architecture Decision Records (ADR)

When introducing **significant architectural changes**, a new ADR entry must be
added to:

```
docs/design-decisions.md
```

Examples of changes that require a new ADR:

```
new core subsystem
changes to EventBus behavior
changes to Hook lifecycle
changes to ServiceRegistry contracts
plugin system extensions
security pipeline changes
```

ADR entries must follow this structure:

```
ADR-XXX — Title

Context
Decision
Consequences
```

This ensures that architectural reasoning remains documented and prevents
future regressions or accidental design drift.
