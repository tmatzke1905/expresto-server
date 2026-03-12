import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebSocketManager } from '../../src/lib/websocket/websocket-manager';
import type { AppConfig } from '../../src/lib/config';
import { EventBus } from '../../src/lib/events';
import type { AppLogger } from '../../src/lib/logger';
import { Server } from 'node:http';
import { ServiceRegistry } from '../../src/lib/services/service-registry';
import { Server as IOServer } from 'socket.io';
import { SignJWT } from 'jose';

// --- Helpers -----------------------------------------------------------
function createLoggerMock(): AppLogger {
  return {
    app: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  } as unknown as AppLogger;
}

function createConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 3000,
    contextRoot: '/api',
    log: { directory: './logs', level: 'debug' },
    websocket: {
      enabled: true,
      path: '/socket.io-test',
      cors: {
        origin: '*',
        methods: ['GET'],
      },
    },
    auth: {
      jwt: {
        enabled: true,
        secret: 'test-secret',
        algorithm: 'HS256',
      },
    },
    ...overrides,
  } as unknown as AppConfig;
}

describe('WebSocketManager', () => {
  let logger: AppLogger;
  let config: AppConfig;
  let eventBus: EventBus;
  let services: ServiceRegistry;
  let server: Server;

  beforeEach(() => {
    logger = createLoggerMock();
    config = createConfig();
    eventBus = new EventBus();
    services = new ServiceRegistry();
    server = new Server();
  });

  // ------------------------------------------------------------------
  // 1. Constructor + config extraction
  // ------------------------------------------------------------------
  it('initializes WebSocket server with correct path and CORS options', () => {
    const manager = new WebSocketManager(server, config, logger, eventBus, services);

    // @ts-expect-error io is private, we check internal state anyway for testing
    expect(manager.io).toBeDefined();

    // @ts-expect-error inspecting internal Socket.IO server
    expect(manager.io.opts.path).toBe('/socket.io-test');
    // @ts-expect-error inspecting internal Socket.IO server
    expect(manager.io.opts.cors.origin).toBe('*');
  });

  // ------------------------------------------------------------------
  // 2. extractTokenFromHandshake
  // ------------------------------------------------------------------
  it('extracts token from handshake.auth.token', () => {
    const manager = new WebSocketManager(server, config, logger, eventBus, services);
    const fakeSocket = { handshake: { auth: { token: 'AAA' } } } as any;

    // @ts-expect-error private
    const token = manager.extractTokenFromHandshake(fakeSocket);
    expect(token).toBe('AAA');
  });

  it('extracts token from handshake.query.token', () => {
    const manager = new WebSocketManager(server, config, logger, eventBus, services);
    const fakeSocket = { handshake: { query: { token: 'BBB' } } } as any;

    // @ts-expect-error private
    const token = manager.extractTokenFromHandshake(fakeSocket);
    expect(token).toBe('BBB');
  });

  it('extracts token from Authorization header', () => {
    const manager = new WebSocketManager(server, config, logger, eventBus, services);
    const fakeSocket = {
      handshake: {
        headers: { authorization: 'Bearer CCC' },
      },
    } as any;

    // @ts-expect-error private
    const token = manager.extractTokenFromHandshake(fakeSocket);
    expect(token).toBe('CCC');
  });

  it('returns null if no token is found', () => {
    const manager = new WebSocketManager(server, config, logger, eventBus, services);
    const fakeSocket = { handshake: {} } as any;

    // @ts-expect-error private
    const token = manager.extractTokenFromHandshake(fakeSocket);
    expect(token).toBeUndefined();
  });

  // ------------------------------------------------------------------
  // 3. setup() handshake middleware + JWT check
  // ------------------------------------------------------------------
  it('rejects connection if no token is provided', async () => {
    const useSpy = vi.spyOn(IOServer.prototype, 'use');
    const emitSpy = vi.spyOn(eventBus, 'emit');
    const manager = new WebSocketManager(server, config, logger, eventBus, services);

    expect(useSpy).toHaveBeenCalled();
    const middleware = useSpy.mock.calls.at(-1)?.[0] as (
      socket: any,
      next: (err?: Error) => void
    ) => Promise<void> | void;

    const fakeSocket = { handshake: {} } as any;
    const next = vi.fn();

    await Promise.resolve(middleware(fakeSocket, next));

    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain('Unauthorized');
    expect(emitSpy).toHaveBeenCalledWith(
      'expresto.websocket.error',
      expect.objectContaining({
        ts: expect.any(String),
        source: 'websocket-manager',
        stage: 'handshake',
        reason: 'missing_token',
      })
    );
  });

  it('rejects connection if JWT is invalid', async () => {
    const useSpy = vi.spyOn(IOServer.prototype, 'use');
    const emitSpy = vi.spyOn(eventBus, 'emit');

    const manager = new WebSocketManager(server, config, logger, eventBus, services);

    expect(useSpy).toHaveBeenCalled();
    const middleware = useSpy.mock.calls.at(-1)?.[0] as (
      socket: any,
      next: (err?: Error) => void
    ) => Promise<void> | void;

    // create a token signed with a wrong secret so verification will fail
    const invalidToken = await new SignJWT({ sub: '123' })
      .setProtectedHeader({ alg: 'HS256' })
      .sign(new TextEncoder().encode('wrong-secret'));

    const fakeSocket = { handshake: { auth: { token: invalidToken } } } as any;
    const next = vi.fn();

    await Promise.resolve(middleware(fakeSocket, next));

    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(Error);
    expect(err?.message).toContain('Forbidden');
    expect(emitSpy).toHaveBeenCalledWith(
      'expresto.websocket.error',
      expect.objectContaining({
        ts: expect.any(String),
        source: 'websocket-manager',
        stage: 'handshake',
        reason: 'invalid_token',
      })
    );
  });

  it('accepts connection if JWT is valid', async () => {
    const useSpy = vi.spyOn(IOServer.prototype, 'use');

    const manager = new WebSocketManager(server, config, logger, eventBus, services);

    expect(useSpy).toHaveBeenCalled();
    const middleware = useSpy.mock.calls.at(-1)?.[0] as (
      socket: any,
      next: (err?: Error) => void
    ) => Promise<void> | void;

    // create a valid token with the same secret and algorithm as in config
    const validToken = await new SignJWT({ sub: '123' })
      .setProtectedHeader({ alg: 'HS256' })
      .sign(new TextEncoder().encode('test-secret'));

    const fakeSocket: any = {
      handshake: {
        auth: { token: validToken },
        headers: { 'x-request-id': 'req-1' },
      },
      data: {},
    };
    const next = vi.fn();

    await Promise.resolve(middleware(fakeSocket, next));

    // called with no error
    expect(next).toHaveBeenCalledWith();
    // and auth payload is attached
    expect(fakeSocket.data.auth).toBeDefined();
    expect(fakeSocket.data.context).toEqual({
      user: '123',
      token: validToken,
      requestId: 'req-1',
    });
    expect(fakeSocket.context).toEqual(fakeSocket.data.context);
  });

  // ------------------------------------------------------------------
  // 3b. EventBus emissions
  // ------------------------------------------------------------------
  it('emits expresto.websocket.connected with stable payload', () => {
    let connectionHandler: ((socket: any) => void) | undefined;
    const onSpy = vi
      .spyOn(IOServer.prototype, 'on')
      .mockImplementation(function (event: any, cb: any) {
        if (event === 'connection') connectionHandler = cb;
        return this as any;
      });
    const emitSpy = vi.spyOn(eventBus, 'emit');

    // constructing the manager registers the connection handler
    new WebSocketManager(server, config, logger, eventBus, services);

    const fakeSocket: any = {
      id: 'sock-1',
      data: {
        auth: { sub: '123' },
        context: { user: '123', token: 'tok-1', requestId: 'req-1' },
      },
      on: vi.fn(),
      onAny: vi.fn(),
    };

    expect(connectionHandler).toBeDefined();
    connectionHandler?.(fakeSocket);

    expect(emitSpy).toHaveBeenCalledWith(
      'expresto.websocket.connected',
      expect.objectContaining({
        ts: expect.any(String),
        source: 'websocket-manager',
        context: expect.objectContaining({
          socketId: 'sock-1',
          auth: { sub: '123' },
          socketContext: { user: '123', token: 'tok-1', requestId: 'req-1' },
        }),
        socketId: 'sock-1',
        auth: { sub: '123' },
        socketContext: { user: '123', token: 'tok-1', requestId: 'req-1' },
      })
    );
  });

  it('emits expresto.websocket.disconnected with stable payload', () => {
    let connectionHandler: ((socket: any) => void) | undefined;
    const onSpy = vi
      .spyOn(IOServer.prototype, 'on')
      .mockImplementation(function (event: any, cb: any) {
        if (event === 'connection') connectionHandler = cb;
        return this as any;
      });
    const emitSpy = vi.spyOn(eventBus, 'emit');

    new WebSocketManager(server, config, logger, eventBus, services);

    // capture disconnect handler registered on socket.on('disconnect', ...)
    let disconnectHandler: ((reason: string) => void) | undefined;
    const fakeSocket: any = {
      id: 'sock-2',
      data: {
        auth: { sub: '999' },
        context: { user: '999', token: 'tok-2', requestId: 'req-2' },
      },
      on: vi.fn((event: string, cb: (reason: string) => void) => {
        if (event === 'disconnect') disconnectHandler = cb;
      }),
      onAny: vi.fn(),
    };

    expect(connectionHandler).toBeDefined();
    connectionHandler?.(fakeSocket);
    expect(disconnectHandler).toBeDefined();

    disconnectHandler?.('client namespace disconnect');

    expect(emitSpy).toHaveBeenCalledWith(
      'expresto.websocket.disconnected',
      expect.objectContaining({
        ts: expect.any(String),
        source: 'websocket-manager',
        context: expect.objectContaining({
          socketId: 'sock-2',
          reason: 'client namespace disconnect',
          socketContext: { user: '999', token: 'tok-2', requestId: 'req-2' },
        }),
        socketId: 'sock-2',
        reason: 'client namespace disconnect',
        socketContext: { user: '999', token: 'tok-2', requestId: 'req-2' },
      })
    );
  });

  it('emits expresto.websocket.message for incoming socket events', () => {
    let connectionHandler: ((socket: any) => void) | undefined;
    vi.spyOn(IOServer.prototype, 'on').mockImplementation(function (event: any, cb: any) {
      if (event === 'connection') connectionHandler = cb;
      return this as any;
    });
    const emitSpy = vi.spyOn(eventBus, 'emit');

    new WebSocketManager(server, config, logger, eventBus, services);

    let onAnyHandler: ((event: string, ...args: unknown[]) => void) | undefined;
    const fakeSocket: any = {
      id: 'sock-msg',
      data: {
        auth: { sub: 'm1' },
        context: { user: 'm1', token: 'tok-msg', requestId: 'req-msg' },
      },
      on: vi.fn(),
      onAny: vi.fn((cb: (event: string, ...args: unknown[]) => void) => {
        onAnyHandler = cb;
      }),
    };

    connectionHandler?.(fakeSocket);
    onAnyHandler?.('chat.message', { text: 'hello' });

    expect(emitSpy).toHaveBeenCalledWith(
      'expresto.websocket.message',
      expect.objectContaining({
        ts: expect.any(String),
        source: 'websocket-manager',
        socketId: 'sock-msg',
        event: 'chat.message',
        payload: { text: 'hello' },
      })
    );
  });

  it('emits expresto.websocket.error for socket runtime errors', () => {
    let connectionHandler: ((socket: any) => void) | undefined;
    vi.spyOn(IOServer.prototype, 'on').mockImplementation(function (event: any, cb: any) {
      if (event === 'connection') connectionHandler = cb;
      return this as any;
    });
    const emitSpy = vi.spyOn(eventBus, 'emit');

    new WebSocketManager(server, config, logger, eventBus, services);

    let errorHandler: ((err: unknown) => void) | undefined;
    const fakeSocket: any = {
      id: 'sock-err',
      data: {
        auth: { sub: 'e1' },
        context: { user: 'e1', token: 'tok-err', requestId: 'req-err' },
      },
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        if (event === 'error') errorHandler = cb as (err: unknown) => void;
      }),
      onAny: vi.fn(),
    };

    connectionHandler?.(fakeSocket);
    errorHandler?.(new Error('socket-failed'));

    expect(emitSpy).toHaveBeenCalledWith(
      'expresto.websocket.error',
      expect.objectContaining({
        ts: expect.any(String),
        source: 'websocket-manager',
        stage: 'runtime',
        socketId: 'sock-err',
        requestId: 'req-err',
        error: 'socket-failed',
      })
    );
  });

  // ------------------------------------------------------------------
  // 4. shutdown()
  // ------------------------------------------------------------------
  it('calls io.close() during shutdown', async () => {
    const manager = new WebSocketManager(server, config, logger, eventBus, services);

    // @ts-expect-error accessing private member for testing
    const io = manager.io;

    const closeSpy = vi.spyOn(io, 'close').mockImplementation((cb?: (err?: Error) => void) => {
      if (cb) cb(); // Socket.IO-callback bedienen
      return Promise.resolve(); // Erwarteter Rückgabetyp
    });

    await manager.shutdown();
    expect(closeSpy).toHaveBeenCalledOnce();
  });
});
