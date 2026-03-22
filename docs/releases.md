# Releases

This document tracks the planned feature scope per version for expresto-server.

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

Release notes:

- [1.0.0-beta](./release-notes/1.0.0-beta.md)

Roadmap scope:

- completed beta-foundation work archived from the active roadmap

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

- beta-foundation work is complete
- `npm run build`, `npm test`, and `npm run coverage` are green
- coverage thresholds require at least 85% statements, functions, and lines
- release notes are drafted
- supported docs are aligned with the implementation

## 1.0.0

Status: planned first stable release

Goal: mark the v1 core as stable for production use.

Roadmap scope:

- Packages 4 and 1 from [roadmap.md](./roadmap.md)

Included feature set:

- everything from `1.0.0-beta`
- supported WebSocket extension API
- example project completed for the supported v1 surface
- example project referenced from README and integration docs

Stable release gate:

- Packages 4 and 1 from [roadmap.md](./roadmap.md) are complete
- the example project uses the published package only
- the example project covers:
  - controller contract
  - JWT and Basic Auth
  - lifecycle hooks
  - EventBus and ServiceRegistry usage
  - ops endpoints and metrics
  - scheduler setup
  - supported WebSocket setup and extension path
- smoke checks validate example startup and basic requests

## 1.1.0

Status: tentative

Goal: add the first supported plugin release without breaking v1.

Roadmap scope:

- Package 3 from [roadmap.md](./roadmap.md)
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

Goal: add scheduler reliability controls without breaking the stable v1 runtime.

Roadmap scope:

- Package 5 from [roadmap.md](./roadmap.md)
- example project refresh for the new stable feature set

Planned feature set:

- scheduler retries, timeout handling, and improved failure reporting
- scheduler observability improvements

Stable release gate:

- scheduler reliability behavior is documented and tested
- example project demonstrates the supported scheduled job setup

## 1.3.0

Status: tentative

Goal: improve production operations, diagnostics, and health reporting.

Roadmap scope:

- Package 6 from [roadmap.md](./roadmap.md)
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

- Package 2 from [roadmap.md](./roadmap.md)

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

- `1.0.0-beta`: completed beta-foundation work
- `1.0.0`: beta foundation plus Packages 4 and 1
- `1.1.0`: Package 3 plus example refresh
- `1.2.0`: Package 5 plus example refresh
- `1.3.0`: Package 6 plus example refresh
- `TBD`: Package 2, version assigned after cluster design review

_Last updated: 2026-03-22_
