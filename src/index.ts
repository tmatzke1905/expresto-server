import type { Server as HttpServer } from 'node:http';
import cors from 'cors';
import express from 'express';
import rateLimitMiddleware from 'express-rate-limit';
import helmet from 'helmet';
import log4js from 'log4js';
import type { Server as SocketIOServer } from 'socket.io';
import { AppConfig, getConfig, initConfig } from './lib/config';
import { ControllerLoader } from './lib/controller-loader';
import { HttpError } from './lib/errors';
import { createEventPayload, EventBus } from './lib/events';
import { HookContext, hookManager, LifecycleHook } from './lib/hooks';
import {
  createPrometheusRouter,
  prometheusMiddleware,
  updateServiceMetrics,
} from './lib/monitoring';
import { otelMiddleware } from './lib/otel';
import { startScheduler, stopScheduler } from './lib/scheduler/runtime';
import { SecurityProvider } from './lib/security';
import { ServiceRegistry } from './lib/services/service-registry';
import { setupLogger } from './lib/setupLogger';
import {
  areOpsEnabled,
  getOpsSecurityMode,
  validateRuntimeSecurityConfig,
} from './lib/security/runtime-config';
import type { AppLogger } from './lib/logger';
import { WebSocketManager } from './lib/websocket/websocket-manager';
import { opsController } from './core/ops/ops-controller';

export type {
  AppConfig,
  AuthConfig,
  OpsConfig,
  SchedulerConfig,
  SchedulerJobConfig,
  WebsocketConfig,
} from './lib/config';
export {
  EventBus,
  createEventPayload,
} from './lib/events';
export type {
  AnyEventHandler,
  EventBusOptions,
  EventHandler,
  ListenerErrorPayload,
  StandardEventPayload,
  StableEventBus,
} from './lib/events';
export {
  HookManager,
  hookManager,
  LifecycleHook,
} from './lib/hooks';
export type { HookContext } from './lib/hooks';
export type { AppLogger } from './lib/logger';
export {
  AppError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  HttpError,
  InternalServerError,
  NotFoundError,
  UnauthorizedError,
} from './lib/errors';
export {
  ServiceRegistry,
} from './lib/services/service-registry';
export {
  signToken,
  verifyToken,
} from './lib/security/jwt';
export type { SupportedHmacAlg } from './lib/security/jwt';
export type {
  SchedulerMode,
  SchedulerModule,
} from './lib/scheduler/types';
export type {
  ExtHandler,
  ExtNext,
  ExtRequest,
  ExtResponse,
  SecurityMode,
} from './lib/types';

export interface ExprestoRuntime {
  app: express.Express;
  config: AppConfig;
  logger: AppLogger;
  hookManager: typeof hookManager;
  eventBus: EventBus;
  services: ServiceRegistry;
  /**
   * Returns the shared Socket.IO server after `runtime.app.listen(...)` has
   * been called with `websocket.enabled=true`.
   *
   * Returns `undefined` when WebSockets are disabled or when no HTTP server has
   * been started for this runtime.
   */
  getSocketServer: () => SocketIOServer | undefined;
}

type BasicAuthUsers = NonNullable<NonNullable<NonNullable<AppConfig['auth']>['basic']>['users']>;
type Log4jsWithShutdown = typeof log4js & { shutdown?: (callback: () => void) => void };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getErrorStatus(err: unknown): number {
  if (err instanceof HttpError) {
    return err.status;
  }
  if (isRecord(err) && typeof err.status === 'number') {
    return err.status;
  }
  return 500;
}

function getErrorCode(err: unknown): string | undefined {
  if (isRecord(err) && typeof err.code === 'string') {
    return err.code;
  }
  return undefined;
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (isRecord(err) && typeof err.message === 'string') {
    return err.message;
  }
  return 'Internal Server Error';
}

/**
 * Creates and configures the expresto-server runtime asynchronously.
 * @param configInput Path to the middleware config JSON file or an AppConfig object.
 */
export async function createServer(configInput: string | AppConfig): Promise<ExprestoRuntime> {
  // Load configuration
  let config: AppConfig;
  if (typeof configInput === 'string') {
    await initConfig(configInput);
    config = getConfig();
  } else {
    config = configInput;
  }

  validateRuntimeSecurityConfig(config);

  // Initialize logger, hooks, events, services
  const logger = setupLogger(config);

  // Mask sensitive config values before logging (supports both array and map forms)
  function maskConfigForLog(cfg: AppConfig): AppConfig {
    const maskUsers = (users: BasicAuthUsers | undefined): BasicAuthUsers | undefined => {
      // If array of user objects [{ username, password }]
      if (Array.isArray(users)) {
        return users.map(u => ({ ...u, password: '***' }));
      }
      // If record map { username: password }
      if (users && typeof users === 'object') {
        return Object.fromEntries(Object.keys(users).map(u => [u, '***'])) as BasicAuthUsers;
      }
      return users;
    };

    const clone = structuredClone(cfg);
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
  const services = new ServiceRegistry(eventBus);

  // Create express app
  const app = express();
  app.locals.eventBus = eventBus;
  app.locals.config = config;
  app.locals.services = services;
  let runtimeServer: HttpServer | undefined;
  let wsManager: WebSocketManager | undefined;

  const metricsEnabled = config.metrics?.enabled !== false;
  const corsEnabled = config.cors?.enabled !== false;
  const helmetEnabled = config.helmet?.enabled !== false;

  const ctx: HookContext = { app, config, logger, eventBus, services };

  const attachWebSocketServer = (httpServer: HttpServer): void => {
    runtimeServer ??= httpServer;

    if (!config.websocket?.enabled || wsManager) {
      return;
    }

    wsManager = new WebSocketManager(httpServer, config, logger, eventBus, services);
    services.set('websocketManager', wsManager);
    updateServiceMetrics(Object.keys(services.getAll()));
    logger.app.info('WebSocket support enabled on shared HTTP server');
  };

  const originalListen = app.listen.bind(app);
  app.listen = ((...args: unknown[]) => {
    const httpServer = (originalListen as (...listenArgs: unknown[]) => HttpServer)(...args);
    attachWebSocketServer(httpServer);
    return httpServer;
  }) as typeof app.listen;

  await hookManager.emit(LifecycleHook.INITIALIZE, ctx);
  await hookManager.emit(LifecycleHook.STARTUP, ctx);
  await startScheduler(ctx);

  updateServiceMetrics(Object.keys(services.getAll()));

  await hookManager.emit(LifecycleHook.PRE_INIT, ctx);

  if (metricsEnabled) {
    app.use(prometheusMiddleware());
    app.use(createPrometheusRouter(config, logger));
  }

  app.use(express.json());

  if (corsEnabled) {
    app.use(cors(config.cors?.options || {}));
  }

  if (helmetEnabled) {
    app.use(helmet(config.helmet?.options || {}));
  }

  if (config.rateLimit?.enabled) {
    app.use(rateLimitMiddleware(config.rateLimit.options));
  }

  app.use(otelMiddleware(config, logger));

  // Initialize security provider (e.g. JWT, Basic Auth)
  // Initialize security provider (JWT, Basic Auth, SECURITY hooks)
  const security = new SecurityProvider(config, logger, hookManager, services, eventBus);

  // Custom middleware hook
  await hookManager.emit(LifecycleHook.CUSTOM_MIDDLEWARE, ctx);

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
  updateServiceMetrics(Object.keys(services.getAll()));

  // Mount consolidated ops endpoints under the contextRoot (e.g. /api/__health, /api/__routes, ...)
  if (areOpsEnabled(config)) {
    const opsSecurityMode = getOpsSecurityMode(config);
    if (opsSecurityMode === 'none') {
      app.use(config.contextRoot, opsController);
    } else {
      app.use(
        config.contextRoot,
        security.createMiddleware({
          mode: opsSecurityMode,
          controller: '__ops',
          fullPath: `${config.contextRoot}/__ops`,
          handlerPath: '__ops',
          method: 'ALL',
        }),
        opsController
      );
    }
  }

  await hookManager.emit(LifecycleHook.POST_INIT, ctx);

  // Global error handler (structured JSON) — deferred so tests/consumers can attach routes first
  const errorHandler: express.ErrorRequestHandler = (err, req, res, _next) => {
    const status = getErrorStatus(err);
    const code = getErrorCode(err);
    const message = getErrorMessage(err);

    const payload = {
      error: {
        message,
        code,
      },
      requestId: req.headers['x-request-id'],
    } as const;

    logger.app.error('request_error', { status, url: req.originalUrl, method: req.method, err });
    // Namespaced framework event for consumers (metrics/audit/etc.)
    eventBus.emit('expresto-server.http.request_error', createEventPayload('http-error-handler', {
      status,
      url: req.originalUrl,
      method: req.method,
      code,
      message,
    }));

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

      try {
        await stopScheduler(ctx);
      } catch (err) {
        logger.app.error('Error during scheduler shutdown:', err);
      }

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

      if (runtimeServer) {
        logger.app.info('Shutting down HTTP server...');
        try {
          await new Promise<void>((resolve, reject) => {
            runtimeServer!.close(err => (err ? reject(err) : resolve()));
          });
        } catch (err) {
          logger.app.error('Error during HTTP server shutdown:', err);
        }
      }
      // flush log appenders
      await new Promise<void>(resolve => {
        try {
          (log4js as Log4jsWithShutdown).shutdown?.(() => resolve());
        } catch {
          /* empty */
        } finally {
          resolve();
        }
      });
      logger.app.info('expresto-server shutdown complete.');
    } catch (e) {
      logger.app.error('Error during shutdown', e);
    } finally {
      process.exit(0);
    }
  };

  const onFatal = (type: string) => (err: unknown) => {
    logger.app.fatal(`${type}:`, err);
    const timer = setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();
    shutdown(type).finally(() => clearTimeout(timer));
  };

  process.on('unhandledRejection', onFatal('unhandledRejection'));
  process.on('uncaughtException', onFatal('uncaughtException'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return {
    app,
    config,
    logger,
    hookManager,
    eventBus,
    services,
    getSocketServer: () => wsManager?.getServer(),
  } satisfies ExprestoRuntime;
}

const isDirectExecution =
  typeof require !== 'undefined' &&
  typeof module !== 'undefined' &&
  require.main === module;

// Allow direct execution as CLI
// This check ensures the server only starts automatically
// when this file is executed directly via `node`, and not when imported as a module.
if (isDirectExecution) {
  // sonar-ignore-next-line typescript:S7785
  (async () => {
    const configPath = process.argv[2] || './middleware.config.json';
    const runtime = await createServer(
      configPath
    );
    const { app, config, logger } = runtime;

    if (config.scheduler?.enabled && config.scheduler?.mode === 'standalone') {
      logger.app.info('expresto-server running in scheduler-only standalone mode (no HTTP server)');
      return;
    }

    app.listen(config.port, config.host || '0.0.0.0', () => {
      logger.app.info(`expresto-server listening at http://${config.host || '0.0.0.0'}:${config.port}`);
    });
  })();
}
