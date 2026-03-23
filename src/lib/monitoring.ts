import express from 'express';
import client, { Counter, Histogram, Gauge, Registry } from 'prom-client';
import type { ClusterRuntimeInfo } from './cluster/context';
import type { AppConfig } from './config';
import type { AppLogger } from './logger';

// Dedicated Registry (keine globalen Side-Effects, gut für Tests)
const registry: Registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

// Konsistente Labels
const labelNames = ['method', 'route', 'status_code'] as const;

// Kernmetriken
const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: labelNames as unknown as string[],
  registers: [registry],
});

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: labelNames as unknown as string[],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

const httpErrorsTotal = new Counter({
  name: 'http_errors_total',
  help: 'Total number of HTTP responses with status >= 400',
  labelNames: labelNames as unknown as string[],
  registers: [registry],
});

const httpInFlight = new Gauge({
  name: 'http_requests_in_flight',
  help: 'Current number of in-flight HTTP requests',
  labelNames: ['route'] as unknown as string[],
  registers: [registry],
});

// Services-Metrik (optional, für Registry-Größe)
const servicesRegistered = new Gauge({
  name: 'services_registered_total',
  help: 'Number of services registered in ServiceRegistry',
  registers: [registry],
});

// Routes/registry related gauges
const routesRegistered = new Gauge({
  name: 'routes_registered_total',
  help: 'Number of registered routes by method and security mode',
  labelNames: ['method', 'secure'] as unknown as string[],
  registers: [registry],
});

const routeConflicts = new Gauge({
  name: 'route_conflicts_total',
  help: 'Number of detected route conflicts at startup',
  registers: [registry],
});

const clusterWorkerInfo = new Gauge({
  name: 'cluster_worker_info',
  help: 'Cluster role metadata for the current process',
  labelNames: ['role', 'worker_id', 'worker_ordinal', 'scheduler_leader'] as unknown as string[],
  registers: [registry],
});

const clusterWorkersConfigured = new Gauge({
  name: 'cluster_workers_configured_total',
  help: 'Configured worker count for the current runtime',
  registers: [registry],
});

export function updateServiceMetrics(countOrKeys: number | string[]): void {
  const count = Array.isArray(countOrKeys) ? countOrKeys.length : countOrKeys;
  servicesRegistered.set(count);
}

/**
 * Update route-related gauges. `routeInfos` is a shallow description of routes
 * with method and security mode; `conflicts` is the amount of detected conflicts.
 */
export function updateRouteMetrics(
  routeInfos: Array<{ method: string; secure: boolean | 'basic' | 'jwt' | 'none' }>,
  conflicts: number
): void {
  // aggregate counts per (method, secure)
  const counts = new Map<string, number>();
  for (const r of routeInfos) {
    const method = (r.method || 'get').toLowerCase();
    const secure =
      r.secure === true ? 'jwt' : r.secure === false ? 'none' : (r.secure as string) || 'none';
    const key = `${method}|${secure}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  // set gauge values for all seen buckets
  for (const [key, value] of counts.entries()) {
    const [method, secure] = key.split('|');
    routesRegistered.set({ method, secure }, value);
  }
  // update conflicts
  routeConflicts.set(conflicts);
}

/**
 * Publishes process-local cluster metadata so Prometheus scrapes can tell which
 * worker produced the sample. Metrics remain worker-local; no aggregation is
 * attempted inside the framework.
 */
export function updateClusterMetrics(info: ClusterRuntimeInfo): void {
  clusterWorkerInfo.reset();
  clusterWorkersConfigured.set(info.workerCount);
  clusterWorkerInfo.set(
    {
      role: info.role,
      worker_id: String(info.workerId ?? 0),
      worker_ordinal: String(info.workerOrdinal ?? 0),
      scheduler_leader: String(info.schedulerLeader),
    },
    1
  );
}

// Route-Label ermitteln
function routeLabel(req: express.Request): string {
  const base = req.baseUrl || '';
  const route = req.route?.path || req.path || 'unknown';
  const full = `${base}${typeof route === 'string' ? route : ''}`.replace(/\/+/, '/');
  return full || 'unknown';
}

export function prometheusMiddleware(): express.RequestHandler {
  return (req, res, next) => {
    const route = routeLabel(req);
    const method = (req.method || 'GET').toUpperCase();
    const end = httpRequestDuration.startTimer({ method, route });
    httpInFlight.inc({ route });

    res.on('finish', () => {
      const status = res.statusCode || 0;
      const labels = { method, route, status_code: String(status) } as Record<string, string>;
      httpRequestsTotal.inc(labels);
      if (status >= 400) httpErrorsTotal.inc(labels);
      end({ status_code: String(status) });
      httpInFlight.dec({ route });
    });

    next();
  };
}

export function createPrometheusRouter(config: AppConfig, _logger: AppLogger): express.Router {
  const router = express.Router();
  const endpoint = config.metrics?.endpoint || '/__metrics';

  router.get(endpoint, async (_req, res) => {
    res.set('Content-Type', registry.contentType);
    res.end(await registry.metrics());
  });

  return router;
}

// Für Tests
export function getPromRegistry(): Registry {
  return registry;
}
