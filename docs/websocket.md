# WebSocket Support

expresto-server can attach Socket.IO to the same HTTP server as the Express runtime.

---

## Enabling WebSockets

WebSocket support must be enabled explicitly:

```json
{
  "websocket": {
    "enabled": true,
    "path": "/socket.io"
  }
}
```

WebSocket authentication uses the same JWT configuration as HTTP routes.

Required configuration:

```json
{
  "auth": {
    "jwt": {
      "enabled": true,
      "secret": "replace-with-a-real-secret",
      "algorithm": "HS256"
    }
  }
}
```

If WebSockets are enabled without secure JWT configuration, startup fails.

Cluster rule:

- `websocket.enabled: true` together with `cluster.enabled: true` is rejected
  at startup
- clustered Socket.IO adapters and sticky-session behavior are not part of the
  supported runtime yet

---

## Authentication Sources

The WebSocket handshake checks for a token in this order:

1. `socket.handshake.auth.token`
2. `socket.handshake.query.token`
3. `Authorization: Bearer <token>` header

If no token is present, the connection is rejected. Invalid tokens are also
rejected.

---

## Socket Context

After successful authentication, the manager attaches normalized context data:

- `socket.context.user`
- `socket.context.token`
- `socket.context.requestId`

The same object is also available as `socket.data.context`.

The verified JWT payload is stored in `socket.data.auth`.

---

## EventBus Integration

The framework emits:

- `expresto-server.websocket.connected`
- `expresto-server.websocket.disconnected`
- `expresto-server.websocket.error`
- `expresto-server.websocket.message`

Handshake failures emit `expresto-server.websocket.error` with a reason such as:

- `missing_token`
- `invalid_token`
- `jwt_not_configured`

---

## Runtime Notes

- Socket.IO runs on the shared HTTP server
- no extra backend port is opened
- TLS termination is expected to happen at the reverse proxy
- the supported runtime accessor is `runtime.getSocketServer()`
- `runtime.getSocketServer()` returns `undefined` until `runtime.app.listen(...)`
  has been called
- `runtime.getSocketServer()` also returns `undefined` in non-listening test
  runtimes and scheduler-only runtimes

## Supported Extension Pattern

Use the shared runtime returned by `createServer()` and attach your custom
Socket.IO behavior after starting the HTTP server:

```ts
import { createServer } from 'expresto-server';

const runtime = await createServer('./middleware.config.prod.json');

runtime.app.listen(runtime.config.port, runtime.config.host ?? '0.0.0.0');

const io = runtime.getSocketServer();
if (!io) {
  throw new Error('Socket.IO server is not available for this runtime.');
}

io.on('connection', socket => {
  socket.on('chat:ping', payload => {
    socket.emit('chat:pong', payload);
  });
});
```

---

_Last updated: 2026-03-23_
