import { EventEmitter } from 'node:events';

export type EventHandler<T = unknown> = (payload: T) => void | Promise<void>;

export type AnyEventHandler = (event: string, payload: unknown) => void | Promise<void>;

export type NamespaceHandler = {
  prefix: string;
  handler: AnyEventHandler;
};

export type EventContext = Record<string, unknown>;

export type StandardEventPayload<TContext extends EventContext = EventContext> = {
  ts: string;
  source?: string;
  context?: TContext;
} & TContext;

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
 * Stable EventBus API that framework modules rely on.
 */
export interface StableEventBus {
  on<T = unknown>(event: string, handler: EventHandler<T>): () => void;
  off<T = unknown>(event: string, handler: EventHandler<T>): void;
  emit<T = unknown>(event: string, payload: T): void;
  emitAsync<T = unknown>(event: string, payload: T): Promise<void>;
}

/**
 * Builds the standard payload shape for framework events.
 *
 * For backwards compatibility we keep contextual fields also flattened at the
 * top-level so existing consumers do not break.
 */
export function createEventPayload<TContext extends EventContext = EventContext>(
  source: string,
  context?: TContext
): StandardEventPayload<TContext> {
  const ts = new Date().toISOString();
  if (context && Object.keys(context).length > 0) {
    return {
      ...context,
      ts,
      source,
      context,
    } as StandardEventPayload<TContext>;
  }
  return {
    ts,
    source,
  } as StandardEventPayload<TContext>;
}

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
export class EventBus implements StableEventBus {
  private readonly emitter: EventEmitter;
  private readonly anyHandlers: Set<AnyEventHandler> = new Set();
  private readonly namespaceHandlers: Set<NamespaceHandler> = new Set();
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
   * Subscribe to all events (wildcard).
   * Returns an unsubscribe function.
   */
  onAny(handler: AnyEventHandler): () => void {
    this.anyHandlers.add(handler);
    return () => this.anyHandlers.delete(handler);
  }

  /**
   * Subscribe to all events with a given prefix.
   * Example: onNamespace('expresto.websocket.', ...)
   * Returns an unsubscribe function.
   */
  onNamespace(prefix: string, handler: AnyEventHandler): () => void {
    const entry: NamespaceHandler = { prefix, handler };
    this.namespaceHandlers.add(entry);
    return () => this.namespaceHandlers.delete(entry);
  }

  /**
   * Unsubscribe a handler.
   */
  off<T = unknown>(event: string, handler: EventHandler<T>): void {
    this.emitter.off(event, handler as unknown as (...args: unknown[]) => void);
  }

  private async runHandler(event: string, originalPayload: unknown, fn: () => void | Promise<void>): Promise<void> {
    try {
      await Promise.resolve(fn());
    } catch (error) {
      const errPayload: ListenerErrorPayload = { event, error, payload: originalPayload };

      if (this.emitter.listenerCount(EventBus.LISTENER_ERROR_EVENT) > 0 && event !== EventBus.LISTENER_ERROR_EVENT) {
        void this.emitAsync(EventBus.LISTENER_ERROR_EVENT, errPayload);
      } else {
        this.onUnhandledListenerError?.(errPayload);
      }
    }
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

    // 1) exact event listeners (stable order from EventEmitter)
    for (const listener of listeners) {
      await this.runHandler(event, payload, () => listener(payload));
    }

    // 2) namespace listeners (stable order by registration)
    for (const entry of this.namespaceHandlers) {
      if (!event.startsWith(entry.prefix)) continue;
      await this.runHandler(event, payload, () => entry.handler(event, payload));
    }

    // 3) wildcard listeners (stable order by registration)
    for (const handler of this.anyHandlers) {
      await this.runHandler(event, payload, () => handler(event, payload));
    }
  }
}
