import { updateRouteMetrics } from './monitoring';
import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import type { ExtHandler, SecurityMode } from './types';
import type { AppLogger } from './logger';
import type { SecurityProvider, RouteSecurityMeta } from './security';
import { RouteRegistry } from './routing/route-registry';

type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch' | 'options';

export type ControllerRouteInfo = {
  method: HttpMethod;
  path: string; // relative handler.path (ohne controller.route)
  fullPath: string; // contextRoot + controller.route + handler.path
  secure: 'basic' | 'jwt' | 'none';
  controller: string; // Dateiname
};

interface RouteHandler {
  method: HttpMethod;
  path: string;
  handler: ExtHandler;
  secure?: SecurityMode;
  middlewares?: ExtHandler[];
}

interface SimpleController {
  route: string;
  handlers: RouteHandler[];
}

interface AdvancedController {
  route: string;
  init: (
    router: express.Router,
    logger: AppLogger,
    security: SecurityProvider
  ) => void | Promise<void>;
}

type ControllerModule = SimpleController | AdvancedController;

/**
 * Lädt Controller-Module und registriert deren Routen.
 */
export class ControllerLoader {
  private readonly routeRegistry = new RouteRegistry();
  private readonly registered: ControllerRouteInfo[] = [];

  constructor(
    private readonly controllerPath: string,
    private readonly logger: AppLogger,
    private readonly security: SecurityProvider
  ) {}

  private isControllerModuleFile(file: string): boolean {
    return ['.js', '.ts'].includes(path.extname(file));
  }

  private isAdvancedController(mod: ControllerModule): mod is AdvancedController {
    return 'init' in mod;
  }

  private isSimpleController(mod: ControllerModule): mod is SimpleController {
    return 'handlers' in mod;
  }

  private resolveSecurityMode(mode?: SecurityMode): 'basic' | 'jwt' | 'none' {
    if (mode === 'basic') {
      return 'basic';
    }
    if (mode === 'jwt' || mode === true) {
      return 'jwt';
    }
    return 'none';
  }

  private registerSimpleRoute(
    router: express.Router,
    contextRoot: string,
    controllerRoute: string,
    file: string,
    handler: RouteHandler
  ): void {
    const method = handler.method.toLowerCase() as HttpMethod;
    const fullPath = path.posix.join(contextRoot, controllerRoute, handler.path);
    const secure = this.resolveSecurityMode(handler.secure);
    const args: ExtHandler[] = [...(handler.middlewares ?? [])];
    const meta: RouteSecurityMeta = {
      mode: secure,
      controller: file,
      fullPath,
      handlerPath: handler.path,
      method,
    };

    args.push(this.security.createMiddleware(meta), handler.handler);
    router[method](handler.path, ...args);

    this.registered.push({
      method,
      path: handler.path,
      fullPath,
      secure,
      controller: file,
    });

    this.routeRegistry.register({
      method,
      path: fullPath,
      secure,
      source: file,
    });
  }

  private async initializeController(
    mod: ControllerModule,
    router: express.Router,
    contextRoot: string,
    file: string
  ): Promise<void> {
    if (this.isAdvancedController(mod)) {
      await mod.init(router, this.logger, this.security);
      return;
    }

    if (this.isSimpleController(mod)) {
      for (const handler of mod.handlers) {
        this.registerSimpleRoute(router, contextRoot, mod.route, file, handler);
      }
      return;
    }

    throw new Error('Controller must export either "init()" or "handlers[]".');
  }

  private async loadControllerModule(
    app: express.Application,
    contextRoot: string,
    fullPath: string,
    file: string
  ): Promise<void> {
    const controllerFile = path.join(fullPath, file);
    this.logger.app.debug(`Loading controller: ${file}`);

    try {
      const mod = (await import(controllerFile)).default as ControllerModule;
      const router = express.Router();

      await this.initializeController(mod, router, contextRoot, file);

      app.use(path.posix.join(contextRoot, mod.route), router);
      this.logger.app.info(`Controller mounted at ${contextRoot}${mod.route}`);
    } catch (err) {
      this.logger.app.error(`Failed to load controller ${file}:`, err);
    }
  }

  private finalizeRouteRegistration(): void {
    const conflicts = this.routeRegistry.detectConflicts();
    for (const msg of conflicts) {
      this.logger.app.warn(`[RouteRegistry] ${msg}`);
    }

    const routeInfos = this.routeRegistry.getRoutes().map(route => ({
      method: route.method,
      secure: route.secure,
    }));
    updateRouteMetrics(routeInfos, conflicts.length);

    if (this.logger.app.isDebugEnabled()) {
      this.logger.app.debug('[RouteRegistry] Registered Routes:');
      for (const route of this.routeRegistry.getSorted()) {
        this.logger.app.debug(`  [${route.method.toUpperCase()}] ${route.path} (${route.secure})`);
      }
    }
  }

  async load(app: express.Application, contextRoot: string): Promise<void> {
    const fullPath = path.resolve(this.controllerPath);

    try {
      const files = await fs.readdir(fullPath);

      for (const file of files) {
        if (!this.isControllerModuleFile(file)) {
          continue;
        }

        await this.loadControllerModule(app, contextRoot, fullPath, file);
      }

      this.finalizeRouteRegistration();
    } catch (err) {
      this.logger.app.error('Failed to read controller directory:', err);
      throw err;
    }
  }

  /** Für /__routes Endpoint */
  getRegisteredRoutes(): ControllerRouteInfo[] {
    return [...this.registered];
  }
}
