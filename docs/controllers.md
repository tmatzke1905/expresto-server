# Controllers

The stable v1 controller contract in expRESTo is a default export with a
`route` string and a `handlers` array.

## Supported Controller Shape

```ts
import type { ExtRequest, ExtResponse } from 'expresto';

export default {
  route: '/users',
  handlers: [
    {
      method: 'get',
      path: '/',
      secure: 'jwt',
      handler: (_req: ExtRequest, res: ExtResponse) => {
        res.json([{ id: '1', name: 'Ada' }]);
      },
    },
  ],
};
```

## Handler Fields

Each entry in `handlers` supports:

- `method`: `get`, `post`, `put`, `delete`, `patch`, or `options`
- `path`: route path inside the controller route
- `secure`: `false`, `true`, `'jwt'`, or `'basic'`
- `handler`: Express-compatible request handler
- `middlewares`: optional array of additional middleware handlers

The final route path is built from:

- `contextRoot`
- controller `route`
- handler `path`

## Security Behavior

- `secure: false` means public
- `secure: true` is treated as JWT-protected
- `secure: 'jwt'` requires working JWT auth
- `secure: 'basic'` requires working Basic Auth

Protected routes fail closed when the required auth mode is unavailable.

## What Is Not Part of the Stable v1 Contract

The controller loader currently also accepts an advanced `init(router, logger,
security)` form, but that signature is not part of the documented v1 contract.

For package consumers, the recommended and supported authoring format is the
default export object shown above.

_Last updated: 2026-03-15_
