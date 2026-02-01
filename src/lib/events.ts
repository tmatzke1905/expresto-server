import { EventEmitter } from 'node:events';

export type EventHandler<T = unknown> = (payload: T) => void | Promise<void>;

export type ListenerErrorPayload = {
  event: string;
  error: unknown;
  payload: unknown;
};

export type EventBusOptions = {
  /** Maximum number of listeners per event (Node default is 10). */
  maxListeners?: number;

  /**
   * Fallback for listener errors if nobody subscribes to LISTENER_ERROR_EVENT.
   *
   * This is intentionally optional: in production you typically want to
   * subscribe to LISTENER_ERROR_EVENT and route it to your logger/metrics.
   */
  onUnhandledListenerError?: (payload: ListenerErrorPayload) => void;
};

/**
 * EventBus is a small async-first event system.
 *
 * Design goals:
 * - Async by default (handlers may return a Promise)
 * - Stable ordering (handlers are executed in registration order)
 * - Unsubscribe support to avoid leaks
 *
 * Important:
 * - `emit()` is fire-and-forget and schedules async handler execution.
 * - Use `emitAsync()` if you explicitly want to await all handlers.
 */
export class EventBus {
  private readonly emitter: EventEmitter;
  private readonly onUnhandledListenerError?: (payload: ListenerErrorPayload) => void;

  /**
   * Emitted when a listener throws/rejects.
   * Consumers may subscribe to handle/log these errors centrally.
   */
  static readonly LISTENER_ERROR_EVENT = 'expresto.eventbus.listener_error';

  constructor(maxListeners?: number);
  constructor(options?: EventBusOptions);
  constructor(arg: number | EventBusOptions = 50) {
    this.emitter = new EventEmitter();

    if (typeof arg === 'number') {
      this.emitter.setMaxListeners(arg);
      this.onUnhandledListenerError = undefined;
    } else {
      this.emitter.setMaxListeners(arg.maxListeners ?? 50);
      this.onUnhandledListenerError = arg.onUnhandledListenerError;
    }
  }

  /**
   * Subscribe to an event.
   * Returns an unsubscribe function.
   */
  on<T = unknown>(event: string, handler: EventHandler<T>): () => void {
    this.emitter.on(event, handler as unknown as (...args: unknown[]) => void);
    return () => this.off(event, handler);
  }

  /**
   * Subscribe once.
   * Returns an unsubscribe function.
   */
  once<T = unknown>(event: string, handler: EventHandler<T>): () => void {
    this.emitter.once(event, handler as unknown as (...args: unknown[]) => void);
    return () => this.off(event, handler);
  }

  /**
   * Unsubscribe a handler.
   */
  off<T = unknown>(event: string, handler: EventHandler<T>): void {
    this.emitter.off(event, handler as unknown as (...args: unknown[]) => void);
  }

  /**
   * Fire-and-forget async emit.
   * Handlers run asynchronously; errors are forwarded to LISTENER_ERROR_EVENT.
   */
  emit<T = unknown>(event: string, payload: T): void {
    void this.emitAsync(event, payload);
  }

  /**
   * Emit an event and await all listeners.
   * Listener execution order is stable.
   */
  async emitAsync<T = unknown>(event: string, payload: T): Promise<void> {
    const listeners = this.emitter.listeners(event) as unknown as Array<EventHandler<T>>;

    for (const listener of listeners) {
      try {
        await Promise.resolve(listener(payload));
      } catch (error) {
        const errPayload: ListenerErrorPayload = { event, error, payload };

        // If someone listens for listener errors, forward the error there.
        if (this.emitter.listenerCount(EventBus.LISTENER_ERROR_EVENT) > 0 && event !== EventBus.LISTENER_ERROR_EVENT) {
          // Fire-and-forget to avoid recursive deadlocks.
          void this.emitAsync(EventBus.LISTENER_ERROR_EVENT, errPayload);
        } else {
          // If nobody handles listener errors, invoke an optional fallback.
          this.onUnhandledListenerError?.(errPayload);
        }
      }
    }
  }
}
