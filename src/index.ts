import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import log4js from 'log4js';
import * as fsp from 'node:fs/promises';
import { AppConfig, getConfig, initConfig } from './lib/config';
import { ControllerLoader } from './lib/controller-loader';
import { HttpError } from './lib/errors';
import { EventBus } from './lib/events';
import { HookContext, hookManager, LifecycleHook } from './lib/hooks';
import {
  createPrometheusRouter,
  prometheusMiddleware,
  updateServiceMetrics,
} from './lib/monitoring';
import { otelMiddleware } from './lib/otel';
import { SecurityProvider } from './lib/security';
import { WebSocketManager } from './lib/websocket/websocket-manager';
import { ServiceRegistry } from './lib/services/service-registry';
import { setupLogger } from './lib/setupLogger';

let server: import('http').Server | undefined;

/**
 * Creates and configures the expRESTo server asynchronously.
 * @param configInput Path to the middleware config JSON file or an AppConfig object.
 */
export async function createServer(configInput: string | AppConfig) {
  // Load configuration
  let config: AppConfig;
  if (typeof configInput === 'string') {
    await initConfig(configInput);
    config = getConfig();
  } else {
    config = configInput;
  }

  // Initialize logger, hooks, events, services
  const logger = setupLogger(config);

  // Mask sensitive config values before logging (supports both array and map forms)
  function maskConfigForLog(cfg: AppConfig): any {
    const maskUsers = (users: any) => {
      // If array of user objects [{ username, password }]
      if (Array.isArray(users)) {
        return users.map(u => ({ ...u, password: '***' }));
      }
      // If record map { username: password }
      if (users && typeof users === 'object') {
        return Object.fromEntries(Object.keys(users).map(u => [u, '***']));
      }
      return users;
    };

    const clone = JSON.parse(JSON.stringify(cfg));
    if (clone.auth?.jwt?.secret) {
      clone.auth.jwt.secret = '***';
    }
    if (clone.auth?.basic?.users) {
      clone.auth.basic.users = maskUsers(clone.auth.basic.users);
    }
    return clone;
  }

  const maskedConfig = maskConfigForLog(config);
  logger.app.info('Logger ready');
  logger.app.info('Loaded configuration', maskedConfig);
  const eventBus = new EventBus({
    onUnhandledListenerError: ({ event, error }) => {
      logger.app.error(`Unhandled EventBus listener error for '${event}'`, error);
    },
  });
  const services = new ServiceRegistry();

  // Create express app
  const app = express();

  // Attach Prometheus middleware for per-request metrics
  app.use(prometheusMiddleware());

  // Mount Prometheus metrics endpoint (before contextRoot!)
  app.use(createPrometheusRouter(config, logger));

  const ctx: HookContext = { config, logger, eventBus, services };

  // Startup lifecycle hook
  await hookManager.emit(LifecycleHook.STARTUP, ctx);

  // Update Prometheus metrics after service registration
  updateServiceMetrics(Object.keys(services.getAll()));

  // Register built-in middleware
  app.use(express.json());
  app.use(cors(config.cors?.options || {}));
  app.use(helmet(config.helmet?.options || {}));

  if (config.rateLimit?.enabled) {
    app.use(rateLimit(config.rateLimit.options));
  }

  app.use(otelMiddleware(config, logger));

  // Pre-initialization hook
  await hookManager.emit(LifecycleHook.PRE_INIT, ctx);

  // Initialize security provider (e.g. JWT, Basic Auth)
  // Initialize security provider (JWT, Basic Auth, SECURITY hooks)
  const security = new SecurityProvider(config, logger, hookManager, services, eventBus);

  // Custom middleware hook
  await hookManager.emit(LifecycleHook.CUSTOM_MIDDLEWARE, ctx);

  // Post-initialization hook
  await hookManager.emit(LifecycleHook.POST_INIT, ctx);

  // Access log middleware
  app.use(
    log4js.connectLogger(logger.access, {
      level: 'auto',
      format: ':remote-addr ":method :url" :status :response-time ms',
    })
  );

  // Load and register controllers
  const loader = new ControllerLoader(config.controllersPath, logger, security);
  await loader.load(app, config.contextRoot);

  // Expose routes via ServiceRegistry for ops/introspection
  services.set('routes', loader.getRegisteredRoutes());

  // Health endpoint
  app.get(`${config.contextRoot}/__health`, (_req, res) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      services: Object.keys(services.getAll()),
    });
  });

  // Config endpoint (masked)
  app.get(`${config.contextRoot}/__config`, (_req, res) => {
    res.json(maskedConfig);
  });

  // Routes introspection endpoint
  app.get(`${config.contextRoot}/__routes`, (_req, res) => {
    res.json(services.get('routes') || []);
  });

  // ---- Ops: read-only log endpoints helpers ----
  async function readLastLines(filePath: string, maxLines: number): Promise<string> {
    try {
      const data = await fsp.readFile(filePath, 'utf8');
      const lines = data.split(/\r?\n/);
      const slice = lines.slice(Math.max(0, lines.length - maxLines));
      return slice.join('\n');
    } catch (err: any) {
      // propagate a controlled HttpError to our error handler
      const e: any = new HttpError(404, `log file not found: ${filePath}`);
      e.code = 'LOG_NOT_FOUND';
      throw e;
    }
  }

  // Ops: read-only endpoints to fetch logs (masked by filesystem paths in config)
  app.get(`${config.contextRoot}/__logs/:type`, async (req, res, next) => {
    try {
      const type = String(req.params.type);
      const lines = Math.max(
        1,
        Math.min(5000, Number.parseInt(String(req.query.lines ?? '200'), 10) || 200)
      );
      const filePath =
        type === 'application'
          ? config.log.application
          : type === 'access'
            ? config.log.access
            : undefined;
      if (!filePath) {
        const err: any = new HttpError(400, 'unknown log type');
        err.code = 'INVALID_LOG_TYPE';
        throw err;
      }
      const text = await readLastLines(filePath, lines);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.send(text);
    } catch (err) {
      next(err);
    }
  });

  // Global error handler (structured JSON) — deferred so tests/consumers can attach routes first
  const errorHandler: express.ErrorRequestHandler = (err: any, req, res, _next) => {
    const isHttp = err instanceof HttpError || typeof (err as any)?.status === 'number';
    const status: number = isHttp ? ((err as any).status ?? 500) : 500;

    const payload = {
      error: {
        message: (err as any)?.message || 'Internal Server Error',
        code: (err as any)?.code,
      },
      requestId: req.headers['x-request-id'],
    } as const;

    logger.app.error('request_error', { status, url: req.originalUrl, method: req.method, err });
    // Namespaced framework event for consumers (metrics/audit/etc.)
    eventBus.emit('expresto.http.request_error', {
      status,
      url: req.originalUrl,
      method: req.method,
      code: (err as any)?.code,
      message: (err as any)?.message,
    });

    // Backward-compatible legacy event name
    eventBus.emit('error', err);

    if (!res.headersSent) {
      res.status(status).json(payload);
    }
  };

  // Defer to next timers phase to ensure consumers/tests can register routes synchronously after createServer()
  setTimeout(() => {
    app.use(errorHandler);
  }, 0);

  // —— Graceful shutdown and fatal handlers ——
  const SHUTDOWN_TIMEOUT_MS = 10_000;
  const SERVICE_SHUTDOWN_TIMEOUT_MS = 30_000;

  const shutdown = async (reason?: unknown) => {
    try {
      logger.app.warn('Starting graceful shutdown...', { reason });
      await hookManager.emit(LifecycleHook.SHUTDOWN, ctx);

      // Ensure all registered services shut down (with 30s timeout safeguard)
      try {
        const shutdownPromise = ctx.services.shutdownAll();
        await Promise.race([
          shutdownPromise,
          new Promise<void>((_resolve, reject) =>
            setTimeout(
              () => reject(new Error('Service shutdown timed out after 30s')),
              SERVICE_SHUTDOWN_TIMEOUT_MS
            )
          ),
        ]);
      } catch (err) {
        logger.app.error('Error during service shutdown:', err);
      }

      if (server) {
        logger.app.info('Shutting down HTTP server...');
        try {
          await new Promise<void>((resolve, reject) => {
            server!.close(err => (err ? reject(err) : resolve()));
          });
        } catch (err) {
          logger.app.error('Error during HTTP server shutdown:', err);
        }
      }
      // flush log appenders
      await new Promise<void>(resolve => {
        try {
          (log4js as any).shutdown?.(() => resolve());
        } catch { /* empty */ } finally {
          resolve();
        }
      });
      logger.app.info('expRESTo shutdown complete.');
    } catch (e) {
      logger.app.error('Error during shutdown', e);
    } finally {
      process.exit(0);
    }
  };

  const onFatal = (type: string) => (err: any) => {
    logger.app.fatal(`${type}:`, err);
    const timer = setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();
    shutdown(type).finally(() => clearTimeout(timer));
  };

  process.on('unhandledRejection', onFatal('unhandledRejection'));
  process.on('uncaughtException', onFatal('uncaughtException'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return { app, config, logger, hookManager, eventBus, services };
}

// Allow direct execution as CLI
// This check ensures the server only starts automatically
// when this file is executed directly via `node`, and not when imported as a module.
if (require.main === module) {
  (async () => {
    const { app, config, logger, eventBus, services } = await createServer(
      './middleware.config.json'
    );

    if (config.scheduler?.enabled && config.scheduler?.mode === 'standalone') {
      logger.app.info('expRESTo running in scheduler-only standalone mode (no HTTP server)');
      return;
    }

    // Start server and capture instance for shutdown
    server = app.listen(config.port, config.host || '0.0.0.0', () => {
      logger.app.info(`expRESTo listening at http://${config.host || '0.0.0.0'}:${config.port}`);
    });

    // Optional WebSocket support on the same HTTP server
    if (config.websocket?.enabled) {
      const wsManager = new WebSocketManager(server!, config, logger, eventBus, services);
      services.set('websocketManager', wsManager as any);
      logger.app.info('WebSocket support enabled on shared HTTP server');
    }
  })();
}
