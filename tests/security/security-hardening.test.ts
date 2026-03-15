import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer } from '../../src/index';

function createConfig(overrides: Record<string, any> = {}) {
  const base = {
    port: 3000,
    host: '127.0.0.1',
    contextRoot: '/api',
    controllersPath: 'tests/controllers',
    log: {
      access: './tests/logs/access.log',
      application: './tests/logs/application.log',
      level: 'fatal',
      traceRequests: false,
    },
    cors: { enabled: false, options: {} },
    helmet: { enabled: false, options: {} },
    rateLimit: { enabled: false, options: {} },
    metrics: { endpoint: '/__metrics' },
    telemetry: { enabled: false },
    auth: {
      jwt: { enabled: false },
      basic: { enabled: false },
    },
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
    websocket: overrides.websocket,
    ops: overrides.ops,
    auth: {
      jwt: { ...base.auth.jwt, ...(overrides.auth?.jwt ?? {}) },
      basic: { ...base.auth.basic, ...(overrides.auth?.basic ?? {}) },
    },
  };
}

function waitForDeferredMiddleware() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Security hardening', () => {
  it('fails startup when JWT auth is enabled without a secret', async () => {
    await expect(
      createServer(
        createConfig({
          auth: {
            jwt: { enabled: true },
            basic: { enabled: false },
          },
        })
      )
    ).rejects.toThrow('JWT authentication requires auth.jwt.secret to be set.');
  });

  it.each(['default_secret', 'change-me'])(
    'fails startup when JWT uses placeholder secret %s',
    async secret => {
      await expect(
        createServer(
          createConfig({
            auth: {
              jwt: { enabled: true, secret },
              basic: { enabled: false },
            },
          })
        )
      ).rejects.toThrow(
        'JWT authentication requires auth.jwt.secret to not use a default placeholder value.'
      );
    }
  );

  it('fails startup when Basic Auth is enabled without users', async () => {
    await expect(
      createServer(
        createConfig({
          auth: {
            jwt: { enabled: false },
            basic: { enabled: true },
          },
        })
      )
    ).rejects.toThrow('Basic authentication requires at least one configured Basic Auth user.');
  });

  it('rejects secure jwt routes when JWT auth is disabled', async () => {
    const runtime = await createServer(createConfig());
    await waitForDeferredMiddleware();

    const res = await request(runtime.app).get('/api/secure/jwt');

    expect(res.status).toBe(503);
    expect(res.body.error.message).toBe('JWT authentication is not configured');
  });

  it('rejects secure basic routes when Basic Auth is disabled', async () => {
    const runtime = await createServer(createConfig());
    await waitForDeferredMiddleware();

    const res = await request(runtime.app).get('/api/secure/basic');

    expect(res.status).toBe(503);
    expect(res.body.error.message).toBe('Basic authentication is not configured');
  });

  it('fails startup when websocket support is enabled without secure JWT auth', async () => {
    await expect(
      createServer(
        createConfig({
          websocket: { enabled: true },
          auth: {
            jwt: { enabled: false },
            basic: { enabled: false },
          },
        })
      )
    ).rejects.toThrow('WebSocket authentication requires auth.jwt.enabled=true.');
  });

  it('fails startup when jwt-protected ops endpoints are configured without JWT auth', async () => {
    await expect(
      createServer(
        createConfig({
          ops: { secure: 'jwt' },
          auth: {
            jwt: { enabled: false },
            basic: { enabled: false },
          },
        })
      )
    ).rejects.toThrow('Ops endpoint protection requires auth.jwt.enabled=true.');
  });

  it('requires ops endpoints to be secured or disabled in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    await expect(createServer(createConfig())).rejects.toThrow(
      'Ops endpoints must be disabled or protected in production'
    );
  });

  it('can disable ops endpoints in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const runtime = await createServer(
      createConfig({
        ops: { enabled: false },
      })
    );

    const res = await request(runtime.app).get('/api/__health');

    expect(res.status).toBe(404);
  });

  it('can protect ops endpoints with basic auth in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const runtime = await createServer(
      createConfig({
        ops: { secure: 'basic' },
        auth: {
          jwt: { enabled: false },
          basic: {
            enabled: true,
            users: { ops: 'secret123' },
          },
        },
      })
    );

    const denied = await request(runtime.app).get('/api/__health');
    expect(denied.status).toBe(401);

    const allowed = await request(runtime.app)
      .get('/api/__health')
      .auth('ops', 'secret123', { type: 'basic' });

    expect(allowed.status).toBe(200);
    expect(allowed.body.status).toBe('ok');
  });
});
