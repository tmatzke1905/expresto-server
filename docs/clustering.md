# Clustering

## Status

This topic is roadmap-only and is not part of the supported v1 release.

expRESTo currently does not implement a full multi-process Node.js cluster
runtime.

## What Exists Today

The config still reserves:

```json
{
  "cluster": {
    "enabled": true
  }
}
```

In the current runtime this flag is only used as a deployment signal for the
scheduler:

- attached scheduler startup is skipped when `cluster.enabled === true`
- `scheduler.mode: "standalone"` together with `cluster.enabled === true`
  aborts startup

## What Is Deferred

The following are deferred to a later feature package:

- worker process bootstrap
- primary/worker lifecycle management
- multi-worker metrics and ops strategy
- WebSocket clustering strategy
- clustered graceful shutdown

See [docs/roadmap.md](./roadmap.md) for the planned clustering package.

_Last updated: 2026-03-15_
