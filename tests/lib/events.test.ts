

import { describe, expect, it, vi } from 'vitest';

import { createEventPayload, EventBus } from '../../src/lib/events';

describe('EventBus', () => {
  it('emits to exact event listeners (async-first)', async () => {
    const bus = new EventBus();

    const calls: string[] = [];
    bus.on('a', async payload => {
      await Promise.resolve();
      calls.push(`a:${String(payload)}`);
    });

    await bus.emitAsync('a', 1);
    expect(calls).toEqual(['a:1']);
  });

  it('supports onAny wildcard listeners', async () => {
    const bus = new EventBus();

    const calls: Array<{ event: string; payload: unknown }> = [];
    bus.onAny(async (event, payload) => {
      await Promise.resolve();
      calls.push({ event, payload });
    });

    await bus.emitAsync('x', { v: 1 });
    await bus.emitAsync('y', { v: 2 });

    expect(calls).toEqual([
      { event: 'x', payload: { v: 1 } },
      { event: 'y', payload: { v: 2 } },
    ]);
  });

  it('supports onNamespace prefix listeners', async () => {
    const bus = new EventBus();

    const calls: string[] = [];
    bus.onNamespace('expresto.websocket.', (event, payload) => {
      calls.push(`${event}:${String((payload as any).id)}`);
    });

    await bus.emitAsync('expresto.websocket.connected', { id: '1' });
    await bus.emitAsync('expresto.scheduler.started', { id: '2' });
    await bus.emitAsync('expresto.websocket.disconnected', { id: '3' });

    expect(calls).toEqual([
      'expresto.websocket.connected:1',
      'expresto.websocket.disconnected:3',
    ]);
  });

  it('executes listeners in stable order: exact -> namespace -> any', async () => {
    const bus = new EventBus();

    const calls: string[] = [];

    bus.on('expresto.websocket.connected', () => {
      calls.push('exact');
    });

    bus.onNamespace('expresto.websocket.', () => {
      calls.push('ns');
    });

    bus.onAny(() => {
      calls.push('any');
    });

    await bus.emitAsync('expresto.websocket.connected', { ok: true });
    expect(calls).toEqual(['exact', 'ns', 'any']);
  });

  it('returns unsubscribe functions for on/onNamespace/onAny', async () => {
    const bus = new EventBus();

    const calls: string[] = [];

    const offExact = bus.on('e', () => {
      calls.push('exact');
    });
    const offNs = bus.onNamespace('e', () => {
      calls.push('ns');
    });
    const offAny = bus.onAny(() => {
      calls.push('any');
    });

    offExact();
    offNs();
    offAny();

    await bus.emitAsync('e', 1);
    expect(calls).toEqual([]);
  });

  it('forwards listener errors to LISTENER_ERROR_EVENT when subscribed', async () => {
    const bus = new EventBus();

    const errorHandler = vi.fn();

    bus.on(EventBus.LISTENER_ERROR_EVENT, errorHandler);
    bus.on('boom', () => {
      throw new Error('fail');
    });

    await bus.emitAsync('boom', { x: 1 });

    expect(errorHandler).toHaveBeenCalledTimes(1);
    const arg = errorHandler.mock.calls[0][0];
    expect(arg.event).toBe('boom');
    expect(arg.payload).toEqual({ x: 1 });
    expect(arg.error).toBeInstanceOf(Error);
    expect((arg.error as Error).message).toBe('fail');
  });

  it('uses onUnhandledListenerError fallback when no LISTENER_ERROR_EVENT listener exists', async () => {
    const fallback = vi.fn();
    const bus = new EventBus({ onUnhandledListenerError: fallback });

    bus.on('boom', async () => {
      await Promise.resolve();
      throw new Error('fail');
    });

    await bus.emitAsync('boom', 123);

    expect(fallback).toHaveBeenCalledTimes(1);
    const arg = fallback.mock.calls[0][0];
    expect(arg.event).toBe('boom');
    expect(arg.payload).toBe(123);
    expect(arg.error).toBeInstanceOf(Error);
  });

  it('emit() is fire-and-forget (does not throw synchronously)', () => {
    const bus = new EventBus();

    bus.on('boom', () => {
      throw new Error('fail');
    });

    expect(() => bus.emit('boom', null)).not.toThrow();
  });

  it('supports explicit off(event, handler)', async () => {
    const bus = new EventBus();
    const calls: number[] = [];
    const handler = (payload: number) => {
      calls.push(payload);
    };

    bus.on('num', handler);
    bus.off('num', handler);

    await bus.emitAsync('num', 1);
    expect(calls).toEqual([]);
  });

  it('builds standard event payload with source/context and flattened fields', () => {
    const payload = createEventPayload('unit-test', { id: '42', ok: true });

    expect(payload.ts).toEqual(expect.any(String));
    expect(payload.source).toBe('unit-test');
    expect(payload.context).toEqual({ id: '42', ok: true });
    expect(payload.id).toBe('42');
    expect(payload.ok).toBe(true);
  });

  it('builds standard event payload with only ts/source when no context is given', () => {
    const payload = createEventPayload('unit-test');
    expect(payload).toEqual({
      ts: expect.any(String),
      source: 'unit-test',
    });
  });
});
