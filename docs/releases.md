# Releases

This document tracks the planned feature scope per version for expRESTo.

It complements [roadmap.md](./roadmap.md):

- `docs/roadmap.md` describes the implementation packages and branch flow
- `docs/releases.md` describes which feature sets belong to which released
  version

## Release Rules

- The first public npm prerelease is tracked as `1.0.0-beta`
  (npm-compatible form of `1.0.0.beta`).
- Prereleases may be published before the example project is complete.
- No version may be declared stable until the example project covers the full
  supported feature set of that version.
- The example project must consume the published package only, not repo-local
  internal imports.
- When a stable release adds new supported features, the example project must
  be extended to cover those features before that version is declared stable.

## 1.0.0-beta

Status: planned first public prerelease

Goal: publish the supported v1 core on npm for early adopters and integration
testing.

Roadmap scope:

- Packages 1-5 in [roadmap.md](./roadmap.md)

Included feature set:

- npm packaging for CommonJS and ESM consumers
- published runtime schema and stable package entrypoints
- fail-closed JWT and Basic Auth behavior
- production-safe ops endpoint policy
- `createServer()` runtime bootstrap
- file-based controller loading
- lifecycle hooks
- EventBus and ServiceRegistry primitives
- Prometheus metrics and OpenTelemetry request tracing
- attached and standalone scheduler runtime
- optional WebSocket support on the shared HTTP server
- v1 public API and runtime contracts documented under `docs/`

Explicitly not included:

- stable example project requirement for release promotion
- plugin loading and plugin configuration
- real multi-process cluster runtime
- public Socket.IO accessor API

Release gate:

- Packages 1-5 are complete
- `npm run build`, `npm test`, and `npm run coverage` are green
- release notes are drafted
- supported docs are aligned with the implementation

## 1.0.0

Status: planned first stable release

Goal: mark the v1 core as stable for production use.

Included feature set:

- everything from `1.0.0-beta`
- example project completed for the supported v1 surface
- example project referenced from README and integration docs

Stable release gate:

- Package 11 from [roadmap.md](./roadmap.md) is complete
- the example project uses the published package only
- the example project covers:
  - controller contract
  - JWT and Basic Auth
  - lifecycle hooks
  - EventBus and ServiceRegistry usage
  - ops endpoints and metrics
  - scheduler setup
  - optional WebSocket setup
- smoke checks validate example startup and basic requests

## 1.1.0

Status: tentative

Goal: add the first supported plugin release without breaking v1.

Roadmap scope:

- Package 7 from [roadmap.md](./roadmap.md)
- example project refresh for the new stable feature set

Planned feature set:

- minimal supported plugin system
- `plugins` configuration support
- documented plugin load order and failure behavior
- stable plugin context based on supported public APIs
- plugin-focused SemVer guarantees and docs

Stable release gate:

- plugin APIs are exported and documented
- example project demonstrates plugin loading and lifecycle integration
- existing v1 app contracts remain backwards compatible

## 1.2.0

Status: tentative

Goal: extend runtime integrations around WebSockets and scheduler reliability.

Roadmap scope:

- Packages 8-9 from [roadmap.md](./roadmap.md)
- example project refresh for the new stable feature set

Planned feature set:

- supported WebSocket extension API
- documented runtime access pattern for Socket.IO integrations
- scheduler retries, timeout handling, and improved failure reporting
- scheduler observability improvements

Stable release gate:

- WebSocket extension points are documented and tested
- scheduler reliability behavior is documented and tested
- example project demonstrates both WebSocket integration and scheduled jobs

## 1.3.0

Status: tentative

Goal: improve production operations, diagnostics, and health reporting.

Roadmap scope:

- Package 10 from [roadmap.md](./roadmap.md)
- example project refresh for the new stable feature set

Planned feature set:

- richer health and dependency reporting
- more mature ops controls and diagnostics
- stable operational documentation for the supported endpoint surface

Stable release gate:

- ops and health contracts are documented
- operational behavior remains fail-closed where required
- example project demonstrates the supported operational setup

## TBD Release — Real Clustering Support

Status: deferred

Target version: to be decided after design freeze

Roadmap scope:

- Package 6 from [roadmap.md](./roadmap.md)

Reason version is still open:

- real clustering may remain additive and fit into a minor release
- or it may change runtime semantics enough to require a new major version

Planned feature set:

- real primary/worker bootstrap
- worker lifecycle management
- cluster-aware metrics, ops, scheduler, and WebSocket strategy
- graceful clustered shutdown

Stable release gate:

- cluster behavior is fully documented
- compatibility impact is reviewed against `docs/versioning-policy.md`
- example or sample deployment demonstrates the supported clustered setup

## Version Mapping Summary

- `1.0.0-beta`: Packages 1-5
- `1.0.0`: Packages 1-5 plus Package 11
- `1.1.0`: Package 7 plus example refresh
- `1.2.0`: Packages 8-9 plus example refresh
- `1.3.0`: Package 10 plus example refresh
- `TBD`: Package 6, version assigned after cluster design review

_Last updated: 2026-03-15_
