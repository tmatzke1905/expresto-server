/**
 * Ops Controller
 *
 * Read-only endpoints for operations and debugging.
 *
 * Design goals:
 * - Safe by default (redacts secrets via config-reader).
 * - No hard dependency on the bootstrap code.
 *   Optional integrations are accessed via `req.app.locals`.
 * - Deterministic and stable response shapes for tests and tooling.
 * - Emits ops events when an EventBus is available.
 *
 * Optional app.locals used:
 * - `app.locals.eventBus`: EventBus-like object with `emit(event, payload)`
 * - `app.locals.services`: ServiceRegistry-like object with `getAll()`
 * - `app.locals.config`: Config-like object with `log.application` / `log.access`
 */
import express from 'express';
import path from 'node:path';

import { getConfig as getLoadedConfig } from '../../lib/config';
import { routeRegistry } from '../../lib/routing/route-registry';
import { readLogTail } from './log-reader';

// Express router mounted under the configured contextRoot (e.g. /api).
export const opsController = express.Router();

// ------------------------------------------------------------
// Optional integrations (kept deliberately loose)
// ------------------------------------------------------------

/**
 * Minimal EventBus contract used by this controller.
 *
 * We intentionally do not import the concrete EventBus class here to avoid
 * circular dependencies and to keep the ops controller usable in tests.
 */
type EventBusLike = {
  emit: (event: string, payload: unknown) => void;
};

/**
 * Minimal ServiceRegistry contract.
 *
 * The bootstrap may attach the real ServiceRegistry to `app.locals.services`.
 */
type ServicesLike = {
  getAll: () => Record<string, unknown>;
};

/**
 * Minimal config contract for resolving log file locations.
 */
type ConfigLike = {
  log?: {
    application?: string;
    access?: string;
  };
};

/**
 * Retrieve an optional EventBus from `app.locals`.
 *
 * When present, ops endpoints emit namespaced events such as:
 * - expresto.ops.health_read
 * - expresto.ops.routes_read
 * - expresto.ops.config_read / expresto.ops.config_error
 * - expresto.ops.logs_read / expresto.ops.logs_error / expresto.ops.logs_not_found
 */
function getEventBus(req: express.Request): EventBusLike | undefined {
  // The bootstrap may attach the EventBus to app.locals.
  // We keep this optional so ops endpoints remain usable in tests/standalone.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (req.app.locals as any).eventBus as EventBusLike | undefined;
}

/**
 * Retrieve an optional ServiceRegistry from `app.locals`.
 *
 * Used to:
 * - list registered services in `__health`
 * - prefer precomputed route metadata in `__routes` (single source of truth)
 */
function getServices(req: express.Request): ServicesLike | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (req.app.locals as any).services as ServicesLike | undefined;
}

/**
 * Retrieve an optional config object from `app.locals`.
 *
 * Used only to resolve configured log file paths.
 */
function getConfig(req: express.Request): ConfigLike | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (req.app.locals as any).config as ConfigLike | undefined;
}

/**
 * Timestamp helper used in event payloads.
 */
function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Redacts secret-like config values before they are exposed via `GET /__config`.
 *
 * Rules:
 * - Keys containing `secret`, `password`, `token`, `key` are masked.
 * - Special case: `auth.basic.users` is a username->password map, therefore
 *   all values below that path are masked even though the keys are usernames.
 */
function redact(value: unknown, path: string[] = []): unknown {
  const p = path.join('.');

  // Special case: basic auth user map -> always mask values
  if (p === 'auth.basic.users' && typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const masked: Record<string, unknown> = {};
    for (const user of Object.keys(obj)) {
      masked[user] = '***';
    }
    return masked;
  }

  if (Array.isArray(value)) {
    return value.map((v, i) => redact(v, [...path, String(i)]));
  }

  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};

    for (const [k, v] of Object.entries(obj)) {
      if (/(secret|password|token|key)/i.test(k)) {
        out[k] = v == null ? v : '***';
      } else {
        out[k] = redact(v, [...path, k]);
      }
    }

    return out;
  }

  return value;
}

/**
 * GET /__health
 *
 * Lightweight health probe.
 *
 * Response:
 * - status: always "ok" when this handler is reached
 * - uptime: process uptime in seconds
 * - services: names of registered services (if ServiceRegistry is available)
 *
 * Emits: expresto.ops.health_read
 */
opsController.get('/__health', (req, res) => {
  const services = getServices(req);
  const serviceNames = services ? Object.keys(services.getAll()) : [];

  getEventBus(req)?.emit('expresto.ops.health_read', {
    ts: nowIso(),
    services: serviceNames,
  });

  res.json({
    status: 'ok',
    uptime: process.uptime(),
    services: serviceNames,
  });
});

/**
 * GET /__routes
 *
 * Returns the currently registered HTTP routes.
 *
 * Preferred source: ServiceRegistry (app.locals.services.getAll().routes)
 * - This is the single source of truth because controllers are loaded during bootstrap.
 * Fallback source: routeRegistry (used in tests/standalone scenarios)
 *
 * Response is an array of:
 * - method: HTTP method (lowercase)
 * - path: full route path (including contextRoot)
 * - secure: "jwt" | "basic" | "none"
 * - source: origin identifier (e.g. controller file), defaults to "unknown"
 *
 * Emits: expresto.ops.routes_read (includes which source was used)
 */
opsController.get('/__routes', (req, res) => {
  const services = getServices(req);

  // Prefer routes provided via ServiceRegistry (set during bootstrap)
  const serviceRoutes = services?.getAll()?.routes as
    | Array<{ method: string; path: string; secure: string; source?: string }>
    | undefined;

  const routes = serviceRoutes ??
    routeRegistry.getRoutes().map(r => ({
      method: r.method,
      path: r.path,
      secure: r.secure,
      source: r.source ?? 'unknown',
    }));

  getEventBus(req)?.emit('expresto.ops.routes_read', {
    ts: nowIso(),
    count: routes.length,
    source: serviceRoutes ? 'service-registry' : 'route-registry',
  });

  res.json(routes);
});

/**
 * GET /__config
 *
 * Returns the active configuration in a form that is safe to expose.
 * The implementation uses a local path-aware `redact()` helper which masks
 * secret-like keys and special cases such as `auth.basic.users`.
 *
 * Emits:
 * - expresto.ops.config_read on success
 * - expresto.ops.config_error on failure
 */
opsController.get('/__config', (req, res) => {
  try {
    const cfg = redact(getLoadedConfig());

    getEventBus(req)?.emit('expresto.ops.config_read', { ts: nowIso() });

    res.json(cfg);
  } catch (err) {
    getEventBus(req)?.emit('expresto.ops.config_error', {
      ts: nowIso(),
      error: String(err),
    });

    res.status(500).json({ error: `Could not read config: ${String(err)}` });
  }
});

/**
 * GET /__logs/:type
 *
 * Reads the tail of a log file.
 *
 * Params:
 * - type: "application" | "access"
 * Query:
 * - lines: number of lines to return (defaults to 50)
 *
 * Log file resolution:
 * - Prefer config paths from app.locals.config.log.{application|access}
 * - Fallback to ./logs/{type}.log (useful in tests)
 *
 * Emits:
 * - expresto.ops.logs_read on success
 * - expresto.ops.logs_error on read errors
 * - expresto.ops.logs_not_found when type is invalid
 */
opsController.get('/__logs/:type', async (req, res, next) => {
  const { type } = req.params;
  const lines = Number.parseInt(req.query.lines as string, 10);
  const lineCount = Number.isFinite(lines) && lines > 0 ? lines : 50;

  const eventBus = getEventBus(req);

  if (!['application', 'access'].includes(type)) {
    eventBus?.emit('expresto.ops.logs_not_found', {
      ts: nowIso(),
      type,
      lines: lineCount,
      status: 400,
    });

    return res.status(400).json({
      error: {
        code: 'INVALID_LOG_TYPE',
        message: 'unknown log type',
      },
    });
  }

  const cfg = getConfig(req);

  let configuredPath: string | undefined;
  if (type === 'application') {
    configuredPath = cfg?.log?.application;
  } else if (type === 'access') {
    configuredPath = cfg?.log?.access;
  } else {
    configuredPath = undefined;
  }

  // Fallback to the conventional local logs folder for tests/standalone.
  const filePath = configuredPath ?? path.join('logs', `${type}.log`);

  try {
    const content = await readLogTail(filePath, lineCount);
    eventBus?.emit('expresto.ops.logs_read', {
      ts: nowIso(),
      type,
      lines: lineCount,
    });
    res.type('text/plain').send(content);
  } catch (err) {
    eventBus?.emit('expresto.ops.logs_error', {
      ts: nowIso(),
      type,
      lines: lineCount,
      error: String(err),
    });
    res.status(500).json({ error: `Could not read log: ${String(err)}` });
  }
});
