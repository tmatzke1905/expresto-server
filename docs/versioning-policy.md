

# Expresto Versioning Policy

This document defines the versioning strategy of the Expresto framework.

The goal is to provide **predictable upgrades**, **stable extension points**,
and **clear compatibility guarantees** for applications and plugins built on
Expresto.

Expresto follows **Semantic Versioning (SemVer)**.

```
MAJOR.MINOR.PATCH
```

Example:

```
1.4.2
```

---

# Version Components

## MAJOR Version

A MAJOR version is incremented when **breaking changes** are introduced.

Breaking changes include:

```
removal of public APIs
changes to framework contracts
changes to plugin interfaces
changes to lifecycle hooks
changes to controller behavior
changes to EventBus semantics
```

Example:

```
1.x.x → 2.0.0
```

Before releasing a new major version:

- breaking changes must be documented
- migration instructions must be provided

---

## MINOR Version

A MINOR version introduces **new features without breaking existing APIs**.

Allowed changes:

```
new modules
new configuration options
new EventBus events
new hooks
new plugin capabilities
performance improvements
```

Example:

```
1.3.0 → 1.4.0
```

Minor releases must remain **backwards compatible**.

---

## PATCH Version

PATCH releases contain **bug fixes and small improvements only**.

Allowed changes:

```
bug fixes
security patches
internal refactoring
non-breaking performance optimizations
```

Example:

```
1.4.1 → 1.4.2
```

Patch releases must **not change framework behavior in a breaking way**.

---

# Public API Definition

The following components are considered **public API**:

```
EventBus API
Hook system
ServiceRegistry API
Controller contract
Scheduler job contract
Plugin system interface
Configuration schema
WebSocket event contracts
```

Changes to these components must follow the SemVer rules.

Internal implementation details may change at any time.

---

# Plugin Compatibility

Plugins should declare compatibility using `peerDependencies`.

Example:

```
{
  "name": "expresto-plugin-redis",
  "peerDependencies": {
    "expresto": ">=1.0.0 <2.0.0"
  }
}
```

Compatibility expectations:

```
PATCH updates → always compatible
MINOR updates → compatible
MAJOR updates → may require plugin updates
```

---

# Deprecation Policy

Before removing functionality the framework should mark APIs as
**deprecated**.

Example:

```
/**
 * @deprecated Use eventBus.emitAsync instead
 */
```

Deprecation rules:

```
deprecated APIs remain available until the next MAJOR release
warnings should be logged where appropriate
migration paths should be documented
```

---

# Release Process

Each release should include:

```
version number
release notes
migration notes (if required)
updated documentation
```

Release notes should summarize:

```
new features
bug fixes
performance improvements
breaking changes
```

---

# Documentation Requirements

Whenever behavior changes the following documentation must be updated:

```
docs/framework-contracts.md
docs/event-catalog.md
docs/design-decisions.md (if architecture changes)
```

This ensures documentation remains synchronized with the codebase.

---

# Stability Expectations

Developers building on Expresto can rely on the following guarantees:

```
Patch releases are safe upgrades
Minor releases are backwards compatible
Major releases may require migration
```

Applications should pin framework versions accordingly.

Example:

```
"expresto": "^1.4.0"
```

---

# Summary

The Expresto versioning policy ensures predictable evolution of the framework.

Key principles:

```
Semantic Versioning
backwards compatibility for minor releases
clear migration paths for major releases
stable framework contracts
```

This policy protects both application developers and plugin authors from
unexpected breaking changes.
