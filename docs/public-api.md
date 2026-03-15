# Public API

This document defines the supported npm package surface for the first
production release of expRESTo.

Only the APIs documented here are considered stable package entrypoints for
v1.x.

## Package Root Exports

Stable runtime bootstrap:

- `createServer`

Stable hook API:

- `HookManager`
- `hookManager`
- `LifecycleHook`
- `HookContext` type

Stable event API:

- `EventBus`
- `createEventPayload`
- `EventBusOptions` type
- `EventHandler` type
- `StableEventBus` type
- related EventBus payload types

Stable service API:

- `ServiceRegistry`

Stable error API:

- `AppError`
- `HttpError`
- `BadRequestError`
- `UnauthorizedError`
- `ForbiddenError`
- `NotFoundError`
- `ConflictError`
- `InternalServerError`

Stable JWT helper API:

- `signToken`
- `verifyToken`
- `SupportedHmacAlg` type

Stable config and authoring types:

- `AppConfig`
- `AuthConfig`
- `OpsConfig`
- `SchedulerConfig`
- `SchedulerJobConfig`
- `WebsocketConfig`
- `SchedulerMode`
- `SchedulerModule`
- `ExtRequest`
- `ExtResponse`
- `ExtHandler`
- `ExtNext`
- `SecurityMode`
- `AppLogger`

## Stable Runtime Contracts

The following user-facing contracts are supported in v1:

- the package root exports listed above
- the JSON configuration schema in `middleware.config.schema.json`
- the documented controller module contract
- the documented scheduler job contract
- the documented EventBus event names and payload shapes

## Explicitly Out of Scope for v1

The following areas are intentionally not supported package API in the first
release:

- plugin loading and plugin configuration
- a real multi-process cluster runtime
- a public Socket.IO server accessor such as `getSocketServer()`
- internal classes that are not exported from the package root

If one of these areas becomes supported later, it should first be added to this
document and to the versioning policy.

_Last updated: 2026-03-15_
