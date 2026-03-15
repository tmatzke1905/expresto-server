import { describe, expect, it, vi } from 'vitest';
import {
  AppError,
  BadRequestError,
  EventBus,
  HookManager,
  LifecycleHook,
  ServiceRegistry,
  createEventPayload,
  createServer,
  signToken,
  verifyToken,
} from '../src';

describe('public root API', () => {
  it('exports the supported runtime primitives from the package root', () => {
    expect(createServer).toBeTypeOf('function');
    expect(HookManager).toBeTypeOf('function');
    expect(LifecycleHook.STARTUP).toBe('startup');
    expect(EventBus).toBeTypeOf('function');
    expect(ServiceRegistry).toBeTypeOf('function');
    expect(BadRequestError).toBeTypeOf('function');
    expect(signToken).toBeTypeOf('function');
    expect(verifyToken).toBeTypeOf('function');
  });

  it('supports hook registration and service access through the root exports', async () => {
    const hooks = new HookManager();
    const services = new ServiceRegistry();
    const listener = vi.fn((ctx: { services: ServiceRegistry }) => {
      ctx.services.set('cache', { shutdown: async () => {} });
    });

    hooks.on(LifecycleHook.STARTUP, listener);
    await hooks.emit(LifecycleHook.STARTUP, {
      app: undefined,
      config: {} as never,
      logger: {
        app: { error: vi.fn() },
        access: {} as never,
      } as never,
      services,
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(services.has('cache')).toBe(true);
  });

  it('supports event payload helpers and JWT roundtrips from the root exports', async () => {
    const eventBus = new EventBus();
    const seen = vi.fn();
    const payload = createEventPayload('public-api-test', { feature: 'events' });

    eventBus.on('expresto.public.test', seen);
    await eventBus.emitAsync('expresto.public.test', payload);

    expect(seen).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'public-api-test',
        feature: 'events',
      })
    );

    const token = await signToken({ sub: 'public-user' }, 'super-secret', 'HS256');
    const decoded = await verifyToken<{ sub: string }>(token, 'super-secret', 'HS256');

    expect(decoded.sub).toBe('public-user');
  });

  it('exports common HTTP error classes from the root entry', () => {
    const err = new BadRequestError('invalid input', { code: 'INVALID' });

    expect(err).toBeInstanceOf(BadRequestError);
    expect(err).toBeInstanceOf(AppError);
    expect(err.status).toBe(400);
    expect(err.code).toBe('INVALID');
  });
});
