import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ServiceRegistry } from '../../src/lib/services/service-registry';

describe('ServiceRegistry', () => {
  let registry: ServiceRegistry;

  beforeEach(() => {
    registry = new ServiceRegistry();
  });

  it('stores and retrieves a service via set/get', () => {
    const svc = { ping: () => 'pong' };
    registry.set('pingService', svc);
    expect(registry.get('pingService')).toBe(svc);
  });

  it('has() returns true for existing keys and false otherwise', () => {
    expect(registry.has('missing')).toBe(false);
    registry.set('present', 42);
    expect(registry.has('present')).toBe(true);
  });

  it('delete() removes a key and returns boolean', () => {
    registry.set('x', { a: 1 });
    expect(registry.delete('x')).toBe(true);
    expect(registry.has('x')).toBe(false);
    // deleting again should return false
    expect(registry.delete('x')).toBe(false);
  });

  it('getAll() returns a shallow copy of all registered services', () => {
    const a = { a: 1 };
    const b = { b: 2 };
    registry.set('A', a);
    registry.set('B', b);

    const all = registry.getAll();
    expect(all).toEqual({ A: a, B: b });

    // modifying the returned object should not affect internal state
    (all as any).C = 3;
    expect(registry.has('C')).toBe(false);
  });

  it('overwrites an existing key on set()', () => {
    const v1 = { v: 1 };
    const v2 = { v: 2 };
    registry.set('dup', v1);
    registry.set('dup', v2);
    expect(registry.get('dup')).toBe(v2);
  });

  it('emits expresto.services.* events when an EventBus is provided', async () => {
    const emit = vi.fn();
    const reg = new ServiceRegistry({ emit } as { emit: (event: string, payload: unknown) => void });
    const closable = { close: vi.fn().mockResolvedValue(undefined) };

    reg.register('db', closable);
    reg.set('cache', closable);
    reg.delete('cache');
    await reg.shutdownAll();

    expect(emit).toHaveBeenCalledWith(
      'expresto.services.registered',
      expect.objectContaining({
        ts: expect.any(String),
        source: 'service-registry',
        name: 'db',
      })
    );
    expect(emit).toHaveBeenCalledWith(
      'expresto.services.shutdown.started',
      expect.objectContaining({
        ts: expect.any(String),
        source: 'service-registry',
      })
    );
    expect(emit).toHaveBeenCalledWith(
      'expresto.services.shutdown.completed',
      expect.objectContaining({
        ts: expect.any(String),
        source: 'service-registry',
        serviceCount: 0,
      })
    );
  });
});
