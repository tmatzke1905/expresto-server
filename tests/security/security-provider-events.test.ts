import type { Request, Response } from 'express';
import { SignJWT } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../src/lib/config';
import { HttpError } from '../../src/lib/errors';
import { EventBus } from '../../src/lib/events';
import type { AppLogger } from '../../src/lib/logger';
import { SecurityProvider, type RouteSecurityMeta } from '../../src/lib/security/security-provider';

function createLoggerMock(): AppLogger {
  return {
    app: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    access: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  } as unknown as AppLogger;
}

function createConfig(): AppConfig {
  return {
    port: 3000,
    contextRoot: '/api',
    log: { directory: './logs', level: 'debug' },
    auth: {
      jwt: {
        enabled: true,
        secret: 'test-secret',
        algorithm: 'HS256',
      },
      basic: {
        enabled: true,
        users: { alice: 'password123' },
      },
    },
  } as unknown as AppConfig;
}

const jwtMeta: RouteSecurityMeta = {
  mode: 'jwt',
  controller: 'test-controller',
  fullPath: '/api/secure/jwt',
  handlerPath: 'test-handler',
  method: 'GET',
};

async function runMiddleware(
  provider: SecurityProvider,
  meta: RouteSecurityMeta,
  req: Partial<Request>,
  res: Partial<Response>
): Promise<unknown> {
  const middleware = provider.createMiddleware(meta);
  return await new Promise(resolve => {
    middleware(req as Request, res as Response, (err?: unknown) => resolve(err));
  });
}

describe('SecurityProvider EventBus integration', () => {
  it('emits expresto.security.authorize with result=allowed on successful JWT auth', async () => {
    const eventBus = new EventBus();
    const seen: Array<{ event: string; payload: unknown }> = [];
    eventBus.onAny((event, payload) => {
      seen.push({ event, payload });
    });

    const provider = new SecurityProvider(createConfig(), createLoggerMock(), undefined, undefined, eventBus);
    const token = await new SignJWT({ sub: 'user-123' })
      .setProtectedHeader({ alg: 'HS256' })
      .sign(new TextEncoder().encode('test-secret'));

    const err = await runMiddleware(
      provider,
      jwtMeta,
      {
        method: 'GET',
        originalUrl: '/api/secure/jwt',
        url: '/api/secure/jwt',
        headers: { authorization: `Bearer ${token}` },
      },
      { set: vi.fn() }
    );

    expect(err).toBeUndefined();
    const evt = seen.find(x => x.event === 'expresto.security.authorize');
    expect(evt).toBeDefined();
    expect(evt?.payload).toEqual(
      expect.objectContaining({
        ts: expect.any(String),
        source: 'security-provider',
        result: 'allowed',
        mode: 'jwt',
        method: 'GET',
        path: '/api/secure/jwt',
      })
    );
  });

  it('emits expresto.security.authorize with result=denied on JWT rejection', async () => {
    const eventBus = new EventBus();
    const seen: Array<{ event: string; payload: unknown }> = [];
    eventBus.onAny((event, payload) => {
      seen.push({ event, payload });
    });

    const provider = new SecurityProvider(createConfig(), createLoggerMock(), undefined, undefined, eventBus);
    const err = await runMiddleware(
      provider,
      jwtMeta,
      {
        method: 'GET',
        originalUrl: '/api/secure/jwt',
        url: '/api/secure/jwt',
        headers: {},
      },
      { set: vi.fn() }
    );

    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(401);

    const evt = seen.find(x => x.event === 'expresto.security.authorize');
    expect(evt).toBeDefined();
    expect(evt?.payload).toEqual(
      expect.objectContaining({
        ts: expect.any(String),
        source: 'security-provider',
        result: 'denied',
        mode: 'jwt',
        status: 401,
      })
    );
  });
});
