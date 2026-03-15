import type { AppConfig } from './config';
import type { AppLogger } from './logger';
import type { EventBus } from './events';
import type { ServiceRegistry } from './services/service-registry';

/**
 * Enum of supported lifecycle hook types.
 */
export enum LifecycleHook {
  /**
   * Called before STARTUP, used to prepare or enrich configuration or minimal resources (like DB pools).
   */
  INITIALIZE = 'initialize',
  /**
   * Initialize services such as DB pools, caches, schedulers.
   */
  STARTUP = 'startup',
  /**
   * Before Express app is initialized, configure middleware that must run early.
   */
  PRE_INIT = 'preInit',
  /**
   * Hook to register custom Express middleware.
   */
  CUSTOM_MIDDLEWARE = 'customMiddleware',
  /**
   * After Express is initialized and routes are loaded.
   */
  POST_INIT = 'postInit',
  /**
   * Graceful shutdown phase for cleanup.
   */
  SHUTDOWN = 'shutdown',
  /**
   * Runs after JWT validation, allows custom security checks.
   */
  SECURITY = 'security',
}

/**
 * Standard context passed to all hook handlers.
 */
export interface HookContext {
  app?: import('express').Express;
  config: AppConfig;
  logger: AppLogger;
  eventBus?: EventBus;
  services: ServiceRegistry;
  request?: import('express').Request;
}

type HookCallback = (ctx: HookContext) => void | Promise<void>;

/**
 * HookManager handles lifecycle hook registration and emission.
 */
export class HookManager {
  private readonly listeners: Map<LifecycleHook, HookCallback[]> = new Map();

  /**
   * Register a callback for a specific hook.
   */
  register(hook: LifecycleHook, callback: HookCallback): void {
    const list = this.listeners.get(hook) || [];
    list.push(callback);
    this.listeners.set(hook, list);
  }

  /**
   * Alias for register() to match common event emitter style.
   *
   * Example usage:
   * ```ts
   * import { hookManager, LifecycleHook } from 'expresto';
   *
   * hookManager.on(LifecycleHook.STARTUP, async (ctx) => {
   *   ctx.logger.app.info("Custom service started");
   *   ctx.services.set("myService", new MyService());
   * });
   * ```
   *
   * @param hook The lifecycle hook type to register against
   * @param callback Async or sync function executed when the hook is emitted
   */
  on(hook: LifecycleHook, callback: HookCallback): void {
    this.register(hook, callback);
  }

  /**
   * Emit a hook with consistent arguments and await all handlers.
   */
  async emit(hook: LifecycleHook, context: HookContext): Promise<void> {
    const listeners = this.listeners.get(hook) || [];
    for (const fn of listeners) {
      try {
        await fn(context);
      } catch (err) {
        context.logger.app.error(`Error in hook [${hook}]:`, err);
        if (hook !== LifecycleHook.CUSTOM_MIDDLEWARE) throw err;
      }
    }
  }
}

// Create and export a global hook manager instance
export const hookManager = new HookManager();
