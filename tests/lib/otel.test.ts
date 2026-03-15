import { EventEmitter } from 'node:events';
import { SpanStatusCode } from '@opentelemetry/api';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { __setTracerForTests, otelMiddleware } from '../../src/lib/otel';

type SpanOptions = {
  throwOnSetAttribute?: unknown;
  throwOnSetStatus?: unknown;
  throwOnEnd?: unknown;
};

class FakeSpan {
  public name = '';
  public attributes: Record<string, unknown> = {};
  public status?: { code: number; message?: string };
  public ended = false;

  constructor(private options: SpanOptions = {}) {}

  setAttribute(key: string, value: unknown) {
    if (this.options.throwOnSetAttribute !== undefined) {
      throw this.options.throwOnSetAttribute;
    }
    this.attributes[key] = value;
  }

  setStatus(status: { code: number; message?: string }) {
    if (this.options.throwOnSetStatus !== undefined) {
      throw this.options.throwOnSetStatus;
    }
    this.status = status;
  }

  end() {
    if (this.options.throwOnEnd !== undefined) {
      throw this.options.throwOnEnd;
    }
    this.ended = true;
  }
}

class FakeTracer {
  public created: FakeSpan[] = [];

  constructor(private spanFactory: () => FakeSpan = () => new FakeSpan()) {}

  startActiveSpan<T>(name: string, fn: (span: FakeSpan) => T): T {
    const span = this.spanFactory();
    span.name = name;
    this.created.push(span);
    return fn(span);
  }
}

function createLogger() {
  return {
    app: {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  } as any;
}

function createResponse(statusCode = 200) {
  const res = new EventEmitter() as EventEmitter & { statusCode: number };
  res.statusCode = statusCode;
  return res as any;
}

afterEach(() => {
  __setTracerForTests(undefined);
});

describe('otelMiddleware', () => {
  it('acts as a no-op when telemetry is disabled', () => {
    const next = vi.fn();
    const middleware = otelMiddleware({ telemetry: { enabled: false } } as any, createLogger());

    middleware({} as any, createResponse(), next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('marks 5xx responses as errors on finish', () => {
    const tracer = new FakeTracer();
    __setTracerForTests(tracer as any);

    const next = vi.fn();
    const req = {
      method: 'GET',
      path: '/health',
      originalUrl: '/health?full=true',
      protocol: 'https',
      hostname: 'api.example.test',
    } as any;
    const res = createResponse(503);

    otelMiddleware({ telemetry: { enabled: true } } as any, createLogger())(req, res, next);
    res.emit('finish');

    expect(next).toHaveBeenCalledTimes(1);
    expect(tracer.created).toHaveLength(1);
    expect(tracer.created[0].name).toBe('expresto.http_request GET /health');
    expect(tracer.created[0].attributes).toEqual(
      expect.objectContaining({
        'http.method': 'GET',
        'http.route': '/health',
        'http.target': '/health?full=true',
        'http.scheme': 'https',
        'net.host.name': 'api.example.test',
        'http.status_code': 503,
      })
    );
    expect(tracer.created[0].status).toEqual({ code: SpanStatusCode.ERROR });
    expect(tracer.created[0].ended).toBe(true);
  });

  it('marks closed sockets as span errors', () => {
    const tracer = new FakeTracer();
    __setTracerForTests(tracer as any);

    const next = vi.fn();
    const req = {
      method: 'POST',
      route: { path: '/stream' },
      url: '/stream?id=42',
      protocol: 'http',
      hostname: 'localhost',
    } as any;
    const res = createResponse(200);

    otelMiddleware({ telemetry: { enabled: true, serviceName: 'expresto' } } as any, createLogger())(
      req,
      res,
      next
    );
    res.emit('close');

    expect(next).toHaveBeenCalledTimes(1);
    expect(tracer.created[0].attributes['service.name']).toBe('expresto');
    expect(tracer.created[0].attributes['http.route']).toBe('/stream');
    expect(tracer.created[0].attributes['http.target']).toBe('/stream?id=42');
    expect(tracer.created[0].status).toEqual({
      code: SpanStatusCode.ERROR,
      message: 'socket closed',
    });
    expect(tracer.created[0].ended).toBe(true);
  });

  it('warns and continues when span handling throws', () => {
    const logger = createLogger();
    const tracer = new FakeTracer(
      () =>
        new FakeSpan({
          throwOnSetAttribute: 'broken-span',
          throwOnSetStatus: new Error('cleanup failed'),
          throwOnEnd: new Error('end failed'),
        })
    );
    __setTracerForTests(tracer as any);

    const next = vi.fn();
    const req = {
      method: 'GET',
      path: '/broken',
      protocol: 'http',
      hostname: 'localhost',
    } as any;

    otelMiddleware({ telemetry: { enabled: true } } as any, logger)(req, createResponse(), next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(logger.app.warn).toHaveBeenCalledWith('otelMiddleware error', expect.any(Error));
    expect((logger.app.warn as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]?.message).toBe('broken-span');
  });
});
