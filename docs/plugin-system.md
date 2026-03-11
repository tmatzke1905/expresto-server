


# Expresto Plugin System

This document describes the **plugin architecture** of the Expresto framework.

Plugins allow projects to extend the framework **without modifying the core**.

The plugin system is intentionally simple and built on top of existing
framework primitives:

- EventBus
- Hooks
- ServiceRegistry

Plugins therefore do not introduce a new runtime abstraction layer. They
compose existing mechanisms.

---

# Design Goals

The plugin system is designed around the following principles.

### Zero Core Modification

Plugins must never require changes to the framework core.

### Predictable Lifecycle

Plugins participate in the same lifecycle hooks as the application.

### Loose Coupling

Plugins communicate through the EventBus rather than direct dependencies.

### Small Surface Area

The plugin API intentionally remains minimal.

---

# What Plugins Can Do

Plugins may extend the framework in several ways.

Typical plugin responsibilities:

```
register infrastructure services
listen to framework events
provide background jobs
add controllers
extend configuration
provide observability features
```

Examples:

```
Redis plugin
PostgreSQL plugin
Metrics plugin
Audit logging plugin
Authentication plugin
```

---

# Plugin Structure

A plugin is simply a module exporting an initialization function.

Example:

```
export default async function plugin(ctx) {

  const { services, eventBus, hookManager, logger } = ctx

}
```

The plugin receives the **runtime context** during initialization.

---

# Plugin Context

The plugin context contains the main runtime components.

Typical context fields:

```
config
services
eventBus
hookManager
logger
```

Example usage:

```
export default async function plugin(ctx) {

  ctx.eventBus.on("expresto.websocket.connected", payload => {
    ctx.logger.app.info("Client connected", payload)
  })

}
```

---

# Plugin Registration

Plugins are registered during application startup.

Example configuration:

```
{
  "plugins": [
    "./plugins/metrics",
    "./plugins/redis"
  ]
}
```

During startup the framework loads and executes each plugin.

Example loader logic:

```
for (const pluginPath of config.plugins) {

  const plugin = await import(pluginPath)

  await plugin.default(context)

}
```

---

# Plugin Lifecycle

Plugins may hook into the normal framework lifecycle.

Example:

```
export default async function plugin(ctx) {

  ctx.hookManager.on("INITIALIZE", async context => {

    // prepare resources

  })

  ctx.hookManager.on("AFTER_STARTUP", async context => {

    // plugin ready

  })

}
```

Available lifecycle hooks:

```
INITIALIZE
BEFORE_STARTUP
AFTER_STARTUP
BEFORE_SHUTDOWN
```

---

# Registering Services

Plugins may register infrastructure services.

Example:

```
export default async function plugin(ctx) {

  const redisClient = createRedisClient()

  ctx.services.register("redis", redisClient)

}
```

Other modules can then access the service via:

```
services.get("redis")
```

---

# Listening to Framework Events

Plugins can subscribe to events emitted by the framework.

Example:

```
ctx.eventBus.on("expresto.websocket.connected", payload => {

  // track connection metrics

})
```

Events emitted by the framework include:

```
expresto.websocket.connected
expresto.websocket.disconnected
expresto.scheduler.job.start
expresto.scheduler.job.success
expresto.scheduler.job.error
```

The complete list of events is documented in:

```
docs/event-catalog.md
```

---

# Emitting Plugin Events

Plugins may also emit their own events.

Example:

```
ctx.eventBus.emit("plugin.redis.connected", {
  host: "localhost"
})
```

Plugin events should follow this naming convention:

```
plugin.<pluginName>.<event>
```

Example:

```
plugin.metrics.report
plugin.redis.connected
```

---

# Plugin Controllers

Plugins may optionally expose controllers.

Example:

```
class MetricsController {

  async getMetrics(req, res) {
    res.json({ status: "ok" })
  }

}
```

The plugin registers the controller during initialization.

Example:

```
router.registerController(MetricsController)
```

---

# Plugin Scheduler Jobs

Plugins may also register scheduled jobs.

Example:

```
ctx.eventBus.on("expresto.scheduler.job.success", payload => {

  // observe job execution

})
```

Or register jobs dynamically.

Example:

```
scheduler.registerJob({
  cron: "*/10 * * * *",
  module: "./jobs/report"
})
```

---

# Plugin Shutdown

Plugins should release resources during shutdown.

Example:

```
ctx.hookManager.on("BEFORE_SHUTDOWN", async ctx => {

  const redis = ctx.services.get("redis")

  await redis.close()

})
```

This guarantees clean resource cleanup.

---

# Recommended Plugin Layout

Example project layout:

```
plugins/

  redis/
    index.ts
    redis-client.ts

  metrics/
    index.ts
    metrics-controller.ts
```

The entry file typically exports the plugin initializer.

```
plugins/redis/index.ts
```

---

# Plugin Isolation

Plugins should avoid direct dependencies on each other.

Recommended communication mechanisms:

```
EventBus
ServiceRegistry
```

This keeps plugins loosely coupled and easier to maintain.

---

# Version Compatibility

Plugins should declare the framework version they support.

Example:

```
{
  "name": "expresto-plugin-redis",
  "peerDependencies": {
    "expresto": ">=1.0.0"
  }
}
```

---

# Best Practices

Plugin authors should follow these guidelines.

### Avoid Global State

Use the plugin context instead of global variables.

### Fail Fast

Validate configuration during `INITIALIZE`.

### Emit Observability Events

Plugins should emit events for important actions.

### Use the ServiceRegistry

Shared resources should be registered as services.

---

# Summary

The Expresto plugin system provides a lightweight mechanism for
extending the framework.

It relies on three core primitives:

```
EventBus
Hooks
ServiceRegistry
```

This design keeps the framework modular while allowing powerful
extensions.

Plugins can introduce new services, controllers, jobs, and event
listeners without modifying the framework core.
