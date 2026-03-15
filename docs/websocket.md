# WebSocket Support

expRESTo can attach Socket.IO to the same HTTP server as the Express runtime.

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

- `expresto.websocket.connected`
- `expresto.websocket.disconnected`
- `expresto.websocket.error`
- `expresto.websocket.message`

Handshake failures emit `expresto.websocket.error` with a reason such as:

- `missing_token`
- `invalid_token`
- `jwt_not_configured`

---

## Runtime Notes

- Socket.IO runs on the shared HTTP server
- no extra backend port is opened
- TLS termination is expected to happen at the reverse proxy
- v1 does not expose a public Socket.IO accessor such as `getSocketServer()`
  from the package root

---

_Last updated: 2026-03-15_
