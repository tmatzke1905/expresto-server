import { Server as HttpServer } from 'node:http';
import { Server as IOServer, type Socket } from 'socket.io';
import type { AppConfig, WebsocketConfig } from '../config';
import type { AppLogger } from '../logger';
import { createEventPayload, EventBus } from '../events';
import { verifyToken, type SupportedHmacAlg } from '../security/jwt';
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

    this.io = new IOServer(server, {
      path: this.wsConfig.path ?? '/socket.io',
      // Socket.IO CORS options are more flexible than our config type.
      // We intentionally keep this loosely typed here.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cors: this.wsConfig.cors as any,
    });

    const auth = config.auth;
    this.jwtEnabled = auth?.jwt?.enabled ?? true;
    this.jwtSecret = auth?.jwt?.secret ?? 'change-me';
    this.jwtAlgorithm = (auth?.jwt?.algorithm ?? 'HS256') as SupportedHmacAlg;

    this.setup();
  }

  /**
   * Configure authentication middleware and connection lifecycle logging.
   */
  private setup(): void {
    // Authentication middleware: runs on every incoming connection
    this.io.use(async (socket, next) => {
      if (!this.jwtEnabled) {
        return next();
      }

      const token = this.extractTokenFromHandshake(socket);
      if (!token) {
        this.logger.app.warn('WebSocket connection rejected: missing token');
        return next(new Error('Unauthorized'));
      }

      try {
        const payload = await verifyToken(token, this.jwtSecret, this.jwtAlgorithm);
        // Attach auth payload to the socket context so handlers can use it
        // without re-validating the token.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const s = socket as any;
        s.data = s.data || {};
        s.data.auth = payload;

        return next();
      } catch (err) {
        this.logger.app.warn('WebSocket connection rejected: invalid token');
        return next(new Error('Forbidden'));
      }
    });

    // Basic connection lifecycle logging + EventBus integration
    this.io.on('connection', socket => {
      this.logger.app.info(`WebSocket client connected: ${socket.id}`);

      // Keep payloads small and stable for consumers.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = socket as any;
      this.eventBus.emit('expresto.websocket.connected', createEventPayload('websocket-manager', {
        socketId: socket.id,
        auth: s.data?.auth,
      }));

      socket.on('disconnect', reason => {
        this.logger.app.info(`WebSocket client disconnected: ${socket.id} (${reason})`);
        this.eventBus.emit('expresto.websocket.disconnected', createEventPayload('websocket-manager', {
          socketId: socket.id,
          reason,
        }));
      });
    });
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
