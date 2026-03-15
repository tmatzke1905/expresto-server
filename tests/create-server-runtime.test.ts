import log4js from 'log4js';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer } from '../src/index';

function createConfig(overrides: Record<string, any> = {}) {
  const base = {
    port: 0,
    host: '127.0.0.1',
    contextRoot: '/api',
    controllersPath: 'tests/controllers',
    log: {
      access: './tests/logs/access.log',
      application: './tests/logs/application.log',
      level: 'ERROR',
      traceRequests: false,
    },
    cors: { enabled: false, options: {} },
    helmet: { enabled: false, options: {} },
    rateLimit: { enabled: false, options: {} },
    metrics: { endpoint: '/__metrics' },
    telemetry: { enabled: false },
    auth: { jwt: { enabled: false }, basic: { enabled: false } },
  };

  return {
    ...base,
    ...overrides,
    log: { ...base.log, ...(overrides.log ?? {}) },
    cors: { ...base.cors, ...(overrides.cors ?? {}) },
    helmet: { ...base.helmet, ...(overrides.helmet ?? {}) },
    rateLimit: { ...base.rateLimit, ...(overrides.rateLimit ?? {}) },
    metrics: { ...base.metrics, ...(overrides.metrics ?? {}) },
    telemetry: { ...base.telemetry, ...(overrides.telemetry ?? {}) },
    auth: {
      jwt: { ...base.auth.jwt, ...(overrides.auth?.jwt ?? {}) },
      basic: { ...base.auth.basic, ...(overrides.auth?.basic ?? {}) },
    },
  };
}

function waitForDeferredMiddleware() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function captureProcessHandlers() {
  const handlers = new Map<string, (...args: any[]) => any>();
  vi.spyOn(process, 'on').mockImplementation(((event: string, handler: (...args: any[]) => any) => {
    handlers.set(String(event), handler);
    return process;
  }) as any);
  return handlers;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createServer runtime behavior', () => {
  it('uses the built-in error handler for object and string errors', async () => {
    captureProcessHandlers();
    const runtime = await createServer(createConfig());
    const seen: unknown[] = [];
    runtime.eventBus.on('expresto.http.request_error', payload => {
      seen.push(payload);
    });

    runtime.app.get('/api/fail-object', (_req, _res, next) => {
      next({ status: 422, code: 'VALIDATION_FAILED', message: 'Bad input' });
    });
    runtime.app.get('/api/fail-string', (_req, _res, next) => {
      next('boom');
    });

    await waitForDeferredMiddleware();

    const objectRes = await request(runtime.app).get('/api/fail-object').set('x-request-id', 'req-123');
    expect(objectRes.status).toBe(422);
    expect(objectRes.body).toEqual({
      error: {
        message: 'Bad input',
        code: 'VALIDATION_FAILED',
      },
      requestId: 'req-123',
    });

    const stringRes = await request(runtime.app).get('/api/fail-string');
    expect(stringRes.status).toBe(500);
    expect(stringRes.body.error.message).toBe('Internal Server Error');
    expect(stringRes.body.error.code).toBeUndefined();

    expect(seen).toEqual([
      expect.objectContaining({
        source: 'http-error-handler',
        status: 422,
        url: '/api/fail-object',
        method: 'GET',
        code: 'VALIDATION_FAILED',
        message: 'Bad input',
      }),
      expect.objectContaining({
        source: 'http-error-handler',
        status: 500,
        url: '/api/fail-string',
        method: 'GET',
        code: undefined,
        message: 'Internal Server Error',
      }),
    ]);
  });

  it('attaches rate limiting when enabled in config', async () => {
    captureProcessHandlers();
    const runtime = await createServer(
      createConfig({
        rateLimit: {
          enabled: true,
          options: {
            windowMs: 60_000,
            max: 1,
            standardHeaders: false,
            legacyHeaders: false,
          },
        },
      })
    );

    const first = await request(runtime.app).get('/api/__health');
    const second = await request(runtime.app).get('/api/__health');

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });

  it('shuts services down and exits cleanly on SIGINT', async () => {
    const handlers = captureProcessHandlers();
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(((_code?: number) => undefined as never) as (code?: number) => never);
    const shutdownSpy = vi
      .spyOn(log4js as typeof log4js & { shutdown: (callback: () => void) => void }, 'shutdown')
      .mockImplementation(callback => callback());

    const runtime = await createServer(createConfig());
    const serviceShutdown = vi.fn().mockResolvedValue(undefined);
    runtime.services.register('demo-service', { shutdown: serviceShutdown });

    await handlers.get('SIGINT')?.();

    expect(serviceShutdown).toHaveBeenCalledTimes(1);
    expect(shutdownSpy).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(runtime.services.list()).toEqual([]);
  });

  it('runs the fatal handler fallback for unhandled rejections', async () => {
    const handlers = captureProcessHandlers();
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(((_code?: number) => undefined as never) as (code?: number) => never);
    const shutdownSpy = vi
      .spyOn(log4js as typeof log4js & { shutdown: (callback: () => void) => void }, 'shutdown')
      .mockImplementation(callback => callback());
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

    const runtime = await createServer(createConfig());
    const serviceShutdown = vi.fn().mockResolvedValue(undefined);
    runtime.services.register('fatal-service', { shutdown: serviceShutdown });

    handlers.get('unhandledRejection')?.(new Error('boom'));
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));

    expect(serviceShutdown).toHaveBeenCalledTimes(1);
    expect(shutdownSpy).toHaveBeenCalledTimes(1);
    expect(clearTimeoutSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});
