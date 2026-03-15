# Current Focus

## Release Readiness Packages

For the first production-ready release, work through the following packages in
order. Each package should be implemented in a dedicated branch and should not
be split across multiple branches unless explicitly required.

Execution rule for release work:

- Finish one package completely before starting the next.
- Keep code changes, tests, and documentation updates in the same branch.
- Merge only after the listed verification steps are green.
- If scope needs to be reduced, update README and `docs/` in the same package.
- Always generate a commit message

### Package 1 — Packaging and Publishability

Branch: `codex/release-01-packaging`

Goal: Make the published package installable, importable, and runnable without
repo-local files.

Checklist:

- [x] Fix `main`, `module`, `exports`, and `start:*` scripts so they match the
      actual build outputs in `dist/`.
- [x] Ensure all runtime-required files are included in the published package
      (for example `middleware.config.schema.json` and other kept runtime
      assets).
- [x] Add a packaging smoke test covering `npm pack --dry-run` and a real
      `require()` / `import()` check against the packed output.
- [x] Verify the package can validate config without relying on the repository
      root.
- [x] Update README quick start and packaging notes to match the real startup
      paths and config file names.

Verification:

- [x] `npm run build`
- [x] Packaging smoke test passes
- [x] README updated

### Package 2 — Security Hardening

Branch: `codex/release-02-security-hardening`

Goal: Make all protected paths fail closed and remove insecure defaults.

Checklist:

- [x] Make Node 22 the minimal Node environment. GitHub Action should run on Node 22
- [x] Make `secure: 'jwt'` reject requests when JWT is disabled or not
      configured.
- [x] Make `secure: 'basic'` reject requests when Basic Auth is disabled or not
      configured.
- [x] Remove default JWT secrets and fail startup on insecure auth
      configuration.
- [x] Apply the same hardening rules to WebSocket authentication.
- [x] Decide how ops endpoints are protected in production
      (disabled-by-config, auth-protected, or both).
- [x] Add regression tests for negative auth paths and insecure config startup
      failures.
- [x] Update `docs/security.md`, `docs/websocket.md`, and relevant config docs.

Verification:

- [x] `npm test -- --run`
- [x] Security regression tests added and passing
- [x] Security docs updated

### Package 3 — Runtime Wiring and Config Contract

Branch: `codex/release-03-runtime-contract`

Goal: Ensure the runtime behavior matches the documented configuration and
startup lifecycle.

Checklist:

- [x] Wire scheduler bootstrap into the normal server startup path instead of
      relying on an unimported side-effect module.
- [x] Add an integration test proving scheduler startup via `createServer()`.
- [x] Make `cors.enabled`, `helmet.enabled`, and any other documented config
      flags behave consistently.
- [x] Decide whether `metrics.enabled` is supported; implement it or remove it
      from the contract.
- [x] Review lifecycle hook names and startup order for consistency between code
      and docs.
- [x] Update `docs/configuration.md`, `docs/lifecycle-hooks.md`,
      `docs/startup-sequence.md`, and `docs/scheduler.md`.

Verification:

- [x] `npm test -- --run`
- [x] Runtime integration tests passing
- [x] Configuration and lifecycle docs updated

### Package 4 — Supported v1 Scope and Public API

Branch: `codex/release-04-v1-scope-api`

Goal: Freeze a realistic supported surface for the first release.

Checklist:

- [x] Decide which features are officially part of v1 and which remain roadmap
      items only.
- [x] Export the supported public API explicitly, or reduce the docs to the
      currently exported API.
- [x] Remove or clearly mark unsupported features from README and docs
      (for example plugin system, clustering, `getSocketServer()`, legacy
      lifecycle names, outdated controller signatures).
- [x] Align controller examples with the real controller loader contract.
- [x] Align service registry and hook examples with the real import surface.
- [x] Update `README.md` and all affected docs under `docs/`.

Verification:

- [x] Public API review completed
- [x] README updated
- [x] Unsupported features either implemented or removed from the release docs

### Package 5 — Release Verification and Final Gate

Branch: `codex/release-05-verification`

Goal: Close the release with a reproducible verification pass.

Checklist:

- [ ] Add end-to-end smoke checks for package import, secure route behavior, ops
      endpoint policy, and scheduler startup.
- [ ] Run the full validation suite: build, tests, and coverage.
- [ ] Review open roadmap items and explicitly move non-v1 work into later
      feature releases.
- [ ] Prepare concise release notes for the first supported release.
- [ ] If architectural behavior changed materially, add/update ADR entries in
      `docs/design-decisions.md`.

Verification:

- [ ] `npm run build`
- [ ] `npm test -- --run`
- [ ] `npm run coverage`
- [ ] Release notes drafted
- [ ] ADRs/doc updates completed where needed

## Deferred Feature Packages (Post-v1)

The following feature areas are intentionally **not** part of the first
supported production release. They should only be started after Package 5 is
finished, or once v1 has been explicitly narrowed and shipped.

### Package 6 — Real Clustering Support

Branch: `codex/feature-06-clustering-runtime`

Goal: Turn the current `cluster.enabled` placeholder into a real, supported
multi-process runtime.

Checklist:

- [ ] Decide the supported cluster model for v2
      (primary/worker, local multi-core only, or extensible abstraction).
- [ ] Implement real bootstrap behavior when `cluster.enabled === true` instead
      of treating the flag only as a scheduler constraint.
- [ ] Define how ops endpoints, metrics, WebSockets, and scheduler behavior work
      across workers.
- [ ] Implement graceful worker shutdown and restart strategy.
- [ ] Add tests for clustered startup, shutdown, worker lifecycle, and
      incompatible mode combinations.
- [ ] Update `docs/clustering.md`, `docs/configuration.md`,
      `docs/startup-sequence.md`, and relevant WebSocket/scheduler docs.

Verification:

- [ ] Cluster bootstrap works in an automated integration test
- [ ] Shutdown behavior is documented and tested
- [ ] Unsupported combinations fail with clear startup errors

### Package 7 — Supported Plugin System

Branch: `codex/feature-07-plugin-system`

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

### Package 8 — WebSocket Extension API

Branch: `codex/feature-08-websocket-extension-api`

Goal: Introduce a deliberate developer-facing WebSocket extension surface, or
explicitly document why it stays internal.

Checklist:

- [ ] Decide whether a public accessor such as `getSocketServer()` is actually
      part of the supported API.
- [ ] If supported, export a stable runtime access pattern for Socket.IO after
      server startup.
- [ ] Define timing rules for when the WebSocket server is available and how
      non-listening or test runtimes should behave.
- [ ] Add tests for access before/after startup, auth context propagation, and
      custom event registration.
- [ ] Update `docs/websocket.md`, README, and public API docs to match the
      chosen contract.

Verification:

- [ ] Public WebSocket access is covered by tests or explicitly documented as unsupported
- [ ] No docs mention private/internal access patterns anymore

### Package 9 — Scheduler Reliability Extensions

Branch: `codex/feature-09-scheduler-reliability`

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

### Package 10 — Ops and Health Maturity

Branch: `codex/feature-10-ops-health-observability`

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

### Package 11 — Example App and Integration Starter

Branch: `codex/feature-11-example-app-starter`

Goal: Give adopters a realistic reference project for the supported v1 API and
follow-up integrations.

Checklist:

- [ ] Create a small example app that consumes the published package only, not
      repo-internal imports.
- [ ] Demonstrate the supported controller contract, auth, ops, scheduler, and
      optional WebSocket setup.
- [ ] Decide whether the database facade belongs inside this repository or as a
      companion project; document the decision.
- [ ] Add smoke checks for the example app startup path and basic requests.
- [ ] Update README and docs to point new users to the example.

Verification:

- [ ] Example app runs from the packaged API surface
- [ ] Docs reference the example as the canonical starting point
- [ ] Integration guidance no longer depends on private repo structure

### Recommended Merge Order

1. `codex/release-01-packaging`
2. `codex/release-02-security-hardening`
3. `codex/release-03-runtime-contract`
4. `codex/release-04-v1-scope-api`
5. `codex/release-05-verification`


## Agent Execution Order

Coding agents should implement the current focus areas in the following order:

1. Packaging and Publishability
2. Security Hardening
3. Runtime Wiring and Config Contract
4. Supported v1 Scope and Public API
5. Release Verification and Final Gate

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
expresto.*
expresto.ops.*
expresto.websocket.*
expresto.scheduler.*
expresto.security.*
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
expresto.websocket.connected
expresto.websocket.disconnected
expresto.websocket.error
expresto.websocket.message
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
expresto.scheduler.started
expresto.scheduler.job.start
expresto.scheduler.job.success
expresto.scheduler.job.error
expresto.scheduler.stopped
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
expresto.security.authorize
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

Goal: >90% coverage.

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
