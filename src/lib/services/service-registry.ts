import { createEventPayload, type StableEventBus } from '../events';

type EventBusLike = {
  emit: StableEventBus['emit'];
};

/**
 * A central service registry used to manage runtime dependencies like database clients, queues, etc.
 */
export class ServiceRegistry {
  private readonly services = new Map<string, unknown>();
  private readonly eventBus?: EventBusLike;

  constructor(eventBus?: EventBusLike) {
    this.eventBus = eventBus;
  }

  private emit(event: string, context: Record<string, unknown>): void {
    this.eventBus?.emit(event, createEventPayload('service-registry', context));
  }

  private store<T>(name: string, instance: T): void {
    this.services.set(name, instance);
    if (
      !(
        instance &&
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (typeof (instance as any).shutdown === 'function' ||
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          typeof (instance as any).close === 'function')
      )
    ) {
      console.warn(`Service '${name}' does not have shutdown or close method.`);
    }
  }

  /**
   * Registers a new service instance.
   * Throws if the service name is already registered.
   */
  register<T>(name: string, instance: T): void {
    if (this.services.has(name)) {
      throw new Error(`Service '${name}' is already registered.`);
    }
    this.store(name, instance);
    this.emit('expresto.services.registered', { name });
  }

  /**
   * Sets a service instance, overwriting existing value if present.
   * This behaves like Map.set and does not throw on duplicates.
   */
  set<T>(name: string, instance: T): void {
    const replaced = this.services.has(name);
    this.store(name, instance);
    this.emit('expresto.services.set', { name, replaced });
  }

  /**
   * Retrieves a service instance by name.
   * Throws if the service is not registered.
   */
  get<T>(name: string): T {
    if (!this.services.has(name)) {
      throw new Error(`Service '${name}' not found.`);
    }
    return this.services.get(name) as T;
  }

  /**
   * Checks if a service is registered.
   */
  has(name: string): boolean {
    return this.services.has(name);
  }

  /**
   * Optionally allow removing a service (e.g. for shutdown/cleanup).
   */
  remove(name: string): void {
    const removed = this.services.delete(name);
    this.emit('expresto.services.removed', { name, removed });
  }

  /**
   * Deletes a service and returns whether it was present.
   */
  delete(name: string): boolean {
    const removed = this.services.delete(name);
    this.emit('expresto.services.removed', { name, removed });
    return removed;
  }

  /**
   * Lists all registered service names (useful for debug).
   */
  list(): string[] {
    return Array.from(this.services.keys());
  }

  /**
   * Returns all registered services as a key-value object.
   */
  getAll(): Record<string, unknown> {
    return Object.fromEntries(this.services.entries());
  }
  /**
   * Attempts to gracefully shut down all registered services.
   * Calls `shutdown` or `close` if available.
   *
   * Note: Services are expected to implement `shutdown` or `close` methods for graceful cleanup,
   * but this is not enforced. If neither method is found, a warning is logged.
   */
  async shutdownAll(): Promise<void> {
    this.emit('expresto.services.shutdown.started', { serviceCount: this.services.size });

    for (const [name, service] of this.services.entries()) {
      try {
        let method: 'shutdown' | 'close' | 'none' = 'none';

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (service && typeof (service as any).shutdown === 'function') {
          method = 'shutdown';
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (service as any).shutdown();
          this.emit('expresto.services.shutdown.success', { name, method });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } else if (service && typeof (service as any).close === 'function') {
          method = 'close';
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (service as any).close();
          this.emit('expresto.services.shutdown.success', { name, method });
        } else {
          console.warn(`Service '${name}' does not have shutdown or close method.`);
          this.emit('expresto.services.shutdown.skipped', { name, method });
        }
      } catch (err) {
        console.error(`Error shutting down service '${name}':`, err);
        this.emit('expresto.services.shutdown.error', {
          name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    this.services.clear();
    this.emit('expresto.services.shutdown.completed', { serviceCount: this.services.size });
  }
}
