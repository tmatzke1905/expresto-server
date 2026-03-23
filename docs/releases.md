# Releases

This document tracks the planned feature scope per version for expresto-server.

It complements [roadmap.md](./roadmap.md):

- `docs/roadmap.md` describes the implementation packages and branch flow
- `docs/releases.md` describes which feature sets belong to which released
  version

## Release Rules

- The first public npm prerelease is tracked as `1.0.0-beta`
  (npm-compatible form of `1.0.0.beta`).
- Follow-up prereleases use npm-compatible suffixes such as `1.0.0-beta.1`
  and `1.1.0-beta`.
- Prereleases may be published before the example project is complete.
- No version may be declared stable until the example project covers the full
  supported feature set of that version.
- The example project must consume the published package only, not repo-local
  internal imports.
- When a stable release adds new supported features, the example project must
  be extended to cover those features before that version is declared stable.

## 1.0.0-beta

Status: published historical first public prerelease

Goal: publish the original supported v1 core on npm for early adopters and
integration testing.

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
- package validation, tests, and coverage were green at publish time
- release notes were drafted
- supported docs were aligned with the implementation

## 1.0.0-beta.1

Status: published historical follow-up prerelease

Goal: publish the supported v1 core plus the new WebSocket runtime extension
API on npm for broader integration testing before the stable `1.0.0` release.

Release notes:

- [1.0.0-beta.1](./release-notes/1.0.0-beta.1.md)

Roadmap scope:

- completed beta-foundation work
- completed Package 4 from [roadmap.md](./roadmap.md)

Included feature set:

- everything from `1.0.0-beta`
- supported WebSocket extension API via `ExprestoRuntime.getSocketServer()`
- documented runtime timing rules for pre-listen, post-listen, and disabled
  WebSocket modes
- strengthened coverage baseline requiring at least 85% statements, functions,
  and lines

Explicitly not included:

- stable example project requirement for release promotion
- plugin loading and plugin configuration
- real multi-process cluster runtime

Release gate:

- `npm run build`, `npm test`, and `npm run coverage` are green
- the WebSocket runtime API is covered by automated tests
- release notes are drafted
- supported docs are aligned with the implementation

## 1.0.0

Status: planned first stable release

Goal: mark the v1 core as stable for production use.

Roadmap scope:

- Package 1 from [roadmap.md](./roadmap.md)
- published prerelease foundation from `1.0.0-beta.1`

Included feature set:

- everything from `1.0.0-beta.1`
- example project completed for the supported v1 surface
- example project referenced from README and integration docs

Stable release gate:

- Package 1 from [roadmap.md](./roadmap.md) is complete
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

## 1.1.0-beta

Status: current public prerelease

Goal: publish the clustered runtime preview for broader operational and
integration testing before the stable minor release.

Release notes:

- [1.1.0-beta](./release-notes/1.1.0-beta.md)

Roadmap scope:

- completed Package 2 from [roadmap.md](./roadmap.md)

Included feature set:

- everything from `1.0.0-beta.1`
- clustered primary/worker bootstrap through the bundled CLI runtime
- leader-only scheduler ownership in cluster mode
- documented cluster shutdown and worker restart behavior
- worker-local ops and metrics output with explicit cluster metadata
- automated integration coverage for clustered startup and restart flow

Explicitly not included:

- stable example project requirement for release promotion
- plugin loading and plugin configuration
- clustered WebSocket deployments

Release gate:

- `npm test` and `npm run coverage` are green
- clustered runtime bootstrap is covered by automated integration tests
- supported cluster documentation is aligned with the implementation

## 1.1.0

Status: tentative

Goal: ship the first stable additive release after `1.0.0` with supported
clustering.

Roadmap scope:

- Package 2 from [roadmap.md](./roadmap.md)
- final release validation for the clustered runtime
- example project refresh if clustering becomes part of the supported example
  surface

Planned feature set:

- everything from `1.1.0-beta`
- stable clustered runtime support
- final SemVer and compatibility review for the additive runtime change

Stable release gate:

- cluster behavior is fully documented and remains backwards compatible for
  single-process apps
- compatibility impact is reviewed against `docs/versioning-policy.md`
- release promotion is explicitly aligned with the stable-release plan

## 1.2.0

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

## 1.3.0

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

## 1.4.0

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

## Version Mapping Summary

- `1.0.0-beta`: initial beta-foundation release
- `1.0.0-beta.1`: beta foundation plus completed Package 4
- `1.0.0`: `1.0.0-beta.1` plus Package 1
- `1.1.0-beta`: prerelease carrying completed Package 2
- `1.1.0`: stable release target for Package 2
- `1.2.0`: Package 3 plus example refresh
- `1.3.0`: Package 5 plus example refresh
- `1.4.0`: Package 6 plus example refresh

_Last updated: 2026-03-23_
