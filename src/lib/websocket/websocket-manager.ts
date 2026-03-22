import { Server as HttpServer } from 'node:http';
import { Server as IOServer, type Socket } from 'socket.io';
import type { AppConfig, WebsocketConfig } from '../config';
import type { AppLogger } from '../logger';
import { createEventPayload, EventBus } from '../events';
import { verifyToken, type SupportedHmacAlg } from '../security/jwt';
import { assertJwtAuthConfigured } from '../security/runtime-config';
import type { ServiceRegistry } from '../services/service-registry';

/**
 * Manages the Socket.IO server that is attached to the existing HTTP server.
 *
 * Responsibilities:
 * - Attach Socket.IO to the existing HTTP server (no extra port).
 * - Enforce JWT-based authentication on the WebSocket handshake.
 * - Expose a shutdown() method so the HTTP shutdown can gracefully close WS, too.
 *
 * NOTE:
 *  - TLS termination is expected to happen at the reverse proxy (e.g. nginx).
 *  - This manager only deals with ws:// on the backend side; from the outside
 *    the client will typically speak wss:// through the proxy.
 */
export class WebSocketManager {
  /**
   * Underlying Socket.IO server instance.
   * Kept private but accessed in tests via @ts-expect-error.
   */
  private readonly io: IOServer;

  private readonly config: AppConfig;
  private readonly wsConfig: WebsocketConfig;
  private readonly logger: AppLogger;
  private readonly eventBus: EventBus;

  private readonly jwtEnabled: boolean;
  private readonly jwtSecret: string;
  private readonly jwtAlgorithm: SupportedHmacAlg;

  private static readonly RESERVED_MESSAGE_EVENTS = new Set(['connect', 'disconnect', 'disconnecting', 'error']);

  constructor(
    server: HttpServer,
    config: AppConfig,
    logger: AppLogger,
    eventBus: EventBus,
    _services?: ServiceRegistry // currently not used directly, reserved for future integration
  ) {
    this.config = config;
    this.logger = logger;
    this.eventBus = eventBus;
    this.wsConfig = config.websocket ?? {};

    assertJwtAuthConfigured(config, 'WebSocket authentication');

    this.io = new IOServer(server, {
      path: this.wsConfig.path ?? '/socket.io',
      // Socket.IO CORS options are more flexible than our config type.
      // We intentionally keep this loosely typed here.
      cors: this.wsConfig.cors,
    });

    const auth = config.auth;
    this.jwtEnabled = auth?.jwt?.enabled === true;
    this.jwtSecret = auth?.jwt?.secret?.trim() ?? '';
    this.jwtAlgorithm = (auth?.jwt?.algorithm ?? 'HS256') as SupportedHmacAlg;

    this.setup();
  }

  /**
   * Returns the underlying Socket.IO server instance for supported runtime
   * extension use cases.
   */
  getServer(): IOServer {
    return this.io;
  }

  /**
   * Configure authentication middleware and connection lifecycle logging.
   */
  private setup(): void {
    // Authentication middleware: runs on every incoming connection
    this.io.use(async (socket, next) => {
      const token = this.extractTokenFromHandshake(socket);
      const requestId = this.extractRequestIdFromHandshake(socket);

      if (!this.jwtEnabled) {
        this.logger.app.error('WebSocket connection rejected: JWT auth is disabled');
        this.eventBus.emit(
          'expresto-server.websocket.error',
          createEventPayload('websocket-manager', {
            stage: 'handshake',
            reason: 'jwt_not_configured',
            requestId,
          })
        );
        return next(new Error('WebSocket authentication is not configured'));
      }

      if (!token) {
        this.logger.app.warn('WebSocket connection rejected: missing token');
        this.eventBus.emit(
          'expresto-server.websocket.error',
          createEventPayload('websocket-manager', {
            stage: 'handshake',
            reason: 'missing_token',
            requestId,
          })
        );
        return next(new Error('Unauthorized'));
      }

      try {
        const payload = await verifyToken(token, this.jwtSecret, this.jwtAlgorithm);
        // Attach auth payload to the socket context so handlers can use it
        // without re-validating the token.
        const s = this.socketState(socket);
        s.data = s.data || {};
        s.data.auth = payload;
        this.attachSocketContext(socket, {
          token,
          requestId,
          user: this.resolveUserFromPayload(payload),
        });

        return next();
      } catch (err) {
        this.logger.app.warn('WebSocket connection rejected: invalid token');
        this.eventBus.emit(
          'expresto-server.websocket.error',
          createEventPayload('websocket-manager', {
            stage: 'handshake',
            reason: 'invalid_token',
            requestId,
            error: err instanceof Error ? err.message : String(err),
          })
        );
        return next(new Error('Forbidden'));
      }
    });

    // Basic connection lifecycle logging + EventBus integration
    this.io.on('connection', socket => {
      this.logger.app.info(`WebSocket client connected: ${socket.id}`);

      // Keep payloads small and stable for consumers.
      const s = this.socketState(socket);
      const socketContext = s.data?.context ?? s.context;
      this.eventBus.emit(
        'expresto-server.websocket.connected',
        createEventPayload('websocket-manager', {
          socketId: socket.id,
          auth: s.data?.auth,
          socketContext,
        })
      );

      if (typeof socket.onAny === 'function') {
        socket.onAny((eventName, ...args) => {
          if (WebSocketManager.RESERVED_MESSAGE_EVENTS.has(eventName)) return;
          this.eventBus.emit(
            'expresto-server.websocket.message',
            createEventPayload('websocket-manager', {
              socketId: socket.id,
              event: eventName,
              payload: args.length <= 1 ? args[0] : args,
              socketContext,
            })
          );
        });
      }

      socket.on('error', err => {
        this.eventBus.emit(
          'expresto-server.websocket.error',
          createEventPayload('websocket-manager', {
            stage: 'runtime',
            socketId: socket.id,
            requestId: socketContext?.requestId,
            error: err instanceof Error ? err.message : String(err),
            socketContext,
          })
        );
      });

      socket.on('disconnect', reason => {
        this.logger.app.info(`WebSocket client disconnected: ${socket.id} (${reason})`);
        this.eventBus.emit(
          'expresto-server.websocket.disconnected',
          createEventPayload('websocket-manager', {
            socketId: socket.id,
            reason,
            socketContext,
          })
        );
      });
    });
  }

  private resolveUserFromPayload(payload: unknown): unknown {
    if (!payload || typeof payload !== 'object') {
      return undefined;
    }
    const data = payload as Record<string, unknown>;
    return data.user ?? data.username ?? data.sub ?? data.id;
  }

  private attachSocketContext(socket: Socket, context: { user?: unknown; token?: string; requestId?: string }): void {
    const s = this.socketState(socket);
    s.data = s.data || {};
    s.data.context = context;
    // Expose the same context on `socket.context` for framework conventions.
    s.context = context;
  }

  private socketState(
    socket: Socket
  ): Socket & {
    data: Record<string, unknown> & {
      auth?: unknown;
      context?: { user?: unknown; token?: string; requestId?: string };
    };
    context?: { user?: unknown; token?: string; requestId?: string };
  } {
    return socket as Socket & {
      data: Record<string, unknown> & {
        auth?: unknown;
        context?: { user?: unknown; token?: string; requestId?: string };
      };
      context?: { user?: unknown; token?: string; requestId?: string };
    };
  }

  /**
   * Extracts a JWT token from the Socket.IO handshake.
   *
   * Priorities:
   * 1. handshake.auth.token
   * 2. handshake.query.token
   * 3. Authorization header: "Bearer <token>"
   */
  // Kept private; tests access via @ts-expect-error on purpose.
  private extractTokenFromHandshake(socket: Socket): string | undefined {
    // 1. Preferred: handshake.auth.token (socket.io standard)
    const auth = socket.handshake.auth;
    if (auth && typeof auth.token === 'string') {
      return auth.token;
    }

    // 2. Fallback: handshake.query.token
    const query = socket.handshake.query;
    if (query && typeof query.token === 'string') {
      return query.token;
    }

    // 3. Authorization header
    const header = socket.handshake.headers?.['authorization'];
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice(7);
    }

    return undefined;
  }

  private extractRequestIdFromHandshake(socket: Socket): string | undefined {
    const raw = socket.handshake.headers?.['x-request-id'];
    if (typeof raw === 'string') {
      return raw;
    }
    if (Array.isArray(raw)) {
      return typeof raw[0] === 'string' ? raw[0] : undefined;
    }
    return undefined;
  }

  /**
   * Gracefully shuts down the Socket.IO server.
   * Called from the global shutdown logic so that all WebSocket
   * connections are closed before the process exits.
   */
  async shutdown(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.io.close(err => {
        if (err) {
          this.logger.app.error('Error while shutting down WebSocket server', err);
          reject(err);
        } else {
          this.logger.app.info('WebSocket server shut down gracefully');
          resolve();
        }
      });
    });
  }
}
