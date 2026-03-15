// src/lib/security/security-provider.ts
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import crypto from 'node:crypto';
import type { AppLogger } from '../logger';
import type { AppConfig } from '../config';
import type { HookManager } from '../hooks';
import { LifecycleHook } from '../hooks';
import type { ServiceRegistry } from '../services/service-registry';
import { createEventPayload, type EventBus } from '../events';
import { verifyToken, type SupportedHmacAlg } from './jwt';
import { assertBasicAuthConfigured, assertJwtAuthConfigured, isBasicEnabled, isJwtEnabled } from './runtime-config';
import { HttpError } from '../errors';

export type RouteSecurityMeta = {
  mode: 'basic' | 'jwt' | 'none';
  controller: string;
  fullPath: string;
  handlerPath: string;
  method: string;
};

/**
 * Zentraler SecurityProvider für JWT & Basic Auth + SECURITY-Hooks.
 *
 * Verantwortlichkeiten:
 * - JWT-Validierung (Header: Authorization: Bearer <token>)
 * - Basic Auth (Authorization: Basic <base64>)
 * - Setzt req.auth (und req.user für Backwards-Kompatibilität)
 * - Ruft LifecycleHook.SECURITY mit HookContext + request auf
 *
 * Projekte hängen sich mit SECURITY-Hooks ein und prüfen Rollen/Claims/Resources selbst.
 */
export class SecurityProvider {
  private readonly logger: AppLogger;

  // JWT
  private readonly jwtEnabled: boolean;
  private readonly jwtSecret: string;
  private readonly jwtAlgorithm: SupportedHmacAlg;

  // Basic
  private readonly basicEnabled: boolean;
  private readonly basicUsers?:
    | Record<string, string>
    | Array<{ username: string; password: string }>;

  constructor(
    private readonly config: AppConfig,
    logger: AppLogger,
    private readonly hooks?: HookManager,
    private readonly services?: ServiceRegistry,
    private readonly eventBus?: EventBus
  ) {
    this.logger = logger;

    const auth = config.auth;

    // JWT settings (from config.auth.jwt)
    this.jwtEnabled = isJwtEnabled(config);
    if (this.jwtEnabled) {
      assertJwtAuthConfigured(config, 'JWT authentication');
    }
    this.jwtSecret = auth?.jwt?.secret?.trim() ?? '';
    const alg = (auth?.jwt?.algorithm || 'HS512') as string;
    this.jwtAlgorithm = ['HS256', 'HS384', 'HS512'].includes(alg.toUpperCase())
      ? (alg.toUpperCase() as SupportedHmacAlg)
      : 'HS512';

    // Basic settings (from config.auth.basic)
    this.basicEnabled = isBasicEnabled(config);
    if (this.basicEnabled) {
      assertBasicAuthConfigured(config, 'Basic authentication');
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.basicUsers = (auth as any)?.basic?.users;
  }

  /**
   * Backwards-kompatible Guard-API für Advanced-Controller ohne Route-Metadaten.
   * Nutzt generische Dummy-Metadaten.
   */
  guard(mode?: 'basic' | 'jwt' | boolean): RequestHandler {
    let secMode: 'basic' | 'jwt' | 'none';

    if (mode === 'basic') {
      secMode = 'basic';
    } else if (mode === 'jwt' || mode === true || (mode === undefined && this.jwtEnabled)) {
      secMode = 'jwt';
    } else {
      secMode = 'none';
    }

    const meta: RouteSecurityMeta = {
      mode: secMode,
      controller: 'unknown',
      fullPath: 'unknown',
      handlerPath: 'unknown',
      method: 'unknown',
    };

    return this.createMiddleware(meta);
  }

  /**
   * Erzeugt eine Security-Middleware für eine konkrete Route mit Metadaten.
   */
  createMiddleware(meta: RouteSecurityMeta): RequestHandler {
    return (req: Request, res: Response, next: NextFunction) => {
      this.handleRequest(req, res, next, meta).catch(err => next(err));
    };
  }

  private emitSecurityEvent(event: string, context: Record<string, unknown>): void {
    this.eventBus?.emit(event, createEventPayload('security-provider', context));
  }

  private async runSecurityHooks(req: Request): Promise<void> {
    if (!this.hooks || !this.services) {
      return;
    }

    await this.hooks.emit(LifecycleHook.SECURITY, {
      config: this.config,
      logger: this.logger,
      services: this.services,
      eventBus: this.eventBus,
      request: req,
    });
  }

  private async authorizeRequest(
    req: Request,
    res: Response,
    meta: RouteSecurityMeta
  ): Promise<void> {
    if (meta.mode === 'basic') {
      await this.handleBasic(req, res);
    } else if (meta.mode === 'jwt') {
      await this.handleJwt(req);
    }

    await this.runSecurityHooks(req);
  }

  private async handleRequest(
    req: Request,
    res: Response,
    next: NextFunction,
    meta: RouteSecurityMeta
  ): Promise<void> {
    // Route-Metadaten am Request verfügbar machen
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any).routeMeta = meta;

    const reqMeta = {
      mode: meta.mode,
      method: req.method,
      path: req.originalUrl || req.url,
      route: meta.fullPath,
      controller: meta.controller,
    };

    try {
      // Offene Routen und authentisierte Routen laufen beide durch denselben SECURITY-Hook.
      await this.authorizeRequest(req, res, meta);

      this.emitSecurityEvent('expresto.security.authorize', {
        ...reqMeta,
        result: 'allowed',
      });

      next();
    } catch (err) {
      this.emitSecurityEvent('expresto.security.authorize', {
        ...reqMeta,
        result: 'denied',
        status: err instanceof HttpError ? err.status : undefined,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  private async handleJwt(req: Request): Promise<void> {
    if (!this.jwtEnabled) {
      this.logger.app.error('JWT: Route requires JWT auth, but auth.jwt.enabled is false');
      throw new HttpError(503, 'JWT authentication is not configured');
    }

    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      this.logger.app.warn('JWT: Missing or invalid Authorization header');
      throw new HttpError(401, 'Unauthorized');
    }

    const token = authHeader.substring(7);

    try {
      const payload = await verifyToken(token, this.jwtSecret, this.jwtAlgorithm);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (req as any).auth = payload;
      // Backwards-Kompatibilität
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (req as any).user = payload;
    } catch (err) {
      this.logger.app.warn('JWT: Invalid token', err);
      throw new HttpError(403, 'Forbidden');
    }
  }

  private async handleBasic(req: Request, res: Response): Promise<void> {
    if (!this.basicEnabled) {
      this.logger.app.error('BasicAuth: Route requires Basic Auth, but auth.basic.enabled is false');
      throw new HttpError(503, 'Basic authentication is not configured');
    }

    const header = req.headers['authorization'];
    if (!header || !header.startsWith('Basic ')) {
      this.logger.app.warn('BasicAuth: Missing or invalid Authorization header');
      res.set('WWW-Authenticate', 'Basic realm="expresto", charset="UTF-8"');
      throw new HttpError(401, 'Unauthorized');
    }

    const base64 = header.slice(6).trim();
    let decoded: string;
    try {
      decoded = Buffer.from(base64, 'base64').toString('utf8');
    } catch {
      this.logger.app.warn('BasicAuth: Cannot decode credentials');
      res.set('WWW-Authenticate', 'Basic realm="expresto", charset="UTF-8"');
      throw new HttpError(401, 'Unauthorized');
    }

    const i = decoded.indexOf(':');
    const username = i >= 0 ? decoded.slice(0, i) : '';
    const password = i >= 0 ? decoded.slice(i + 1) : '';

    if (!this.checkBasicCredentials(username, password)) {
      this.logger.app.warn('BasicAuth: Invalid credentials for user', username);
      res.set('WWW-Authenticate', 'Basic realm="expresto", charset="UTF-8"');
      throw new HttpError(401, 'Unauthorized');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any).auth = { username, auth: 'basic' };
    // Backwards-Kompatibilität
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any).user = { username, auth: 'basic' };
  }

  private checkBasicCredentials(username: string, password: string): boolean {
    if (!this.basicUsers) return false;

    const safeEq = (a: string, b: string) => {
      const ab = Buffer.from(a);
      const bb = Buffer.from(b);
      if (ab.length !== bb.length) return false;
      return crypto.timingSafeEqual(ab, bb);
    };

    if (Array.isArray(this.basicUsers)) {
      for (const u of this.basicUsers) {
        if (u.username === username && safeEq(u.password, password)) return true;
      }
      return false;
    }

    const expected = (this.basicUsers as Record<string, string>)[username];
    if (typeof expected !== 'string') return false;
    return safeEq(expected, password);
  }
}
