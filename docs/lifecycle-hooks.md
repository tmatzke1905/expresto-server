# Lifecycle Hooks

expRESTo uses a small hook pipeline around `createServer()` and graceful
shutdown.

## Hook Order

The runtime emits hooks in this order during bootstrap:

1. `LifecycleHook.INITIALIZE`
2. `LifecycleHook.STARTUP`
3. attached scheduler startup
4. `LifecycleHook.PRE_INIT`
5. framework middleware registration
6. `LifecycleHook.CUSTOM_MIDDLEWARE`
7. controller and ops mounting
8. `LifecycleHook.POST_INIT`

During shutdown, the scheduler is stopped first, then
`LifecycleHook.SHUTDOWN` is emitted, and finally registered services are shut
down.

## Available Hooks

| Hook | When it runs | Typical use |
|------|--------------|-------------|
| `INITIALIZE` | After logger, EventBus, ServiceRegistry, and Express app are created | Early config enrichment, minimal infrastructure prep |
| `STARTUP` | Before scheduler bootstrap and before middleware/routes are mounted | Register services, warm caches, validate dependencies |
| `PRE_INIT` | After startup services are ready and before framework middleware is mounted | Add very early Express middleware via `ctx.app` |
| `CUSTOM_MIDDLEWARE` | After framework middleware and security provider setup, before routes | Register custom middleware that should run before controllers |
| `POST_INIT` | After controllers, route registry, and ops endpoints are mounted | Final readiness checks, startup logging, route introspection |
| `SHUTDOWN` | During graceful shutdown, after scheduler stop begins and before service shutdown | Cleanup work that should run before registry teardown |
| `SECURITY` | Per request after authentication, inside the security pipeline | Custom authorization checks |

## Hook Context

Hook handlers receive a `HookContext` with:

- `app`: the Express app being assembled
- `config`: the validated runtime config
- `logger`: the framework logger bundle
- `eventBus`: the EventBus instance
- `services`: the ServiceRegistry
- `request`: present only for request-scoped hooks such as `SECURITY`

## Registering a Hook

The hook API currently lives in `src/lib/hooks.ts`:

```ts
import { hookManager, LifecycleHook, type HookContext } from '../src/lib/hooks';

hookManager.on(LifecycleHook.STARTUP, async (ctx: HookContext) => {
  ctx.services.set('db', await connectDatabase());
});
```

`PRE_INIT` and `CUSTOM_MIDDLEWARE` can mount middleware directly:

```ts
hookManager.on(LifecycleHook.PRE_INIT, async (ctx) => {
  ctx.app?.use((req, _res, next) => {
    req.headers['x-runtime-ready'] = 'true';
    next();
  });
});
```

## Error Handling

- Errors in `INITIALIZE`, `STARTUP`, `PRE_INIT`, `POST_INIT`, and `SHUTDOWN`
  abort the current startup or shutdown flow.
- Errors in `CUSTOM_MIDDLEWARE` are logged but do not abort bootstrap.
- `SECURITY` hook failures reject the current request.

_Last updated: 2026-03-15_
