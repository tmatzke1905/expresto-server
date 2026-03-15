# Plugin System

## Status

This topic is roadmap-only and is not part of the supported v1 release.

expRESTo does not currently load plugins from configuration and does not expose
a stable plugin runtime contract in the published package.

## Why This Document Exists

The repository contains design work for a future plugin system based on
existing primitives such as:

- EventBus
- lifecycle hooks
- ServiceRegistry

Those ideas are useful for future planning, but they are not implemented as a
supported feature today.

## What Is Deferred

The following remain deferred until a dedicated feature package is completed:

- `plugins` configuration support
- plugin discovery and load order
- plugin startup failure handling
- a stable plugin context
- documented SemVer guarantees for plugins

See [docs/roadmap.md](./roadmap.md) for the planned plugin package.

_Last updated: 2026-03-15_
