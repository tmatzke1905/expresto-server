

# Expresto Request Lifecycle

This document describes the complete lifecycle of an incoming HTTP request
inside the Expresto framework.

The goal is to make the internal flow predictable and observable for both
framework developers and projects built on top of Expresto.

---

# High-Level Request Flow

```
Client
  │
  ▼
HTTP Server (Express)
  │
  ▼
Router
  │
  ▼
Controller Resolution
  │
  ▼
Security / Authorization Hooks
  │
  ▼
Controller Handler
  │
  ▼
Business Logic
  │
  ▼
Response Serialization
  │
  ▼
HTTP Response
```

Each stage has clearly defined responsibilities and extension points.

---

# Step 1 — Incoming Request

An HTTP request arrives at the Express server.

Example:

```
GET /api/users/42
Authorization: Bearer <token>
```

Express parses the request and forwards it to the Expresto router.

Responsibilities:

- HTTP parsing
- header normalization
- body parsing

---

# Step 2 — Router

The router resolves the request to a controller method.

Responsibilities:

- match HTTP method
- match route path
- extract route parameters

Example route:

```
GET /users/:id
```

Resolved controller:

```
UserController.getUser(id)
```

If no route matches:

→ HTTP `404 Not Found`

---

# Step 3 — Controller Resolution

After routing, Expresto prepares the controller invocation.

Tasks performed:

- controller instance resolution
- parameter extraction
- request context creation

The request context typically contains:

```
{
  requestId,
  logger,
  services,
  config,
  eventBus
}
```

This context object allows controllers to access framework services
without relying on global state.

---

# Step 4 — Security Hooks

Before executing the controller logic, security hooks may run.

Typical responsibilities:

- authentication
- authorization
- request validation

Authentication sources may include:

```
Authorization header
query.token
cookies
```

Example flow:

```
verify JWT
extract user
attach user to request context
```

If authorization fails:

→ HTTP `403 Forbidden`

---

# Step 5 — Controller Handler

The controller method is executed.

Example:

```
async getUser(ctx) {
  return userService.findById(ctx.params.id)
}
```

Responsibilities of controllers:

- orchestrate business logic
- validate input
- call services

Controllers should remain thin and avoid embedding heavy business logic.

---

# Step 6 — Business Logic

Business logic may interact with:

- database services
- external APIs
- message queues
- caches

Services are retrieved from the ServiceRegistry.

Example:

```
const db = ctx.services.get("database")
```

This keeps infrastructure concerns separate from controller code.

---

# Step 7 — Event Emission (Optional)

During request processing, modules may emit events through the EventBus.

Example:

```
eventBus.emit("expresto.ops.request", {
  endpoint: "/users/42",
  method: "GET"
})
```

Events allow:

- monitoring
- plugin integrations
- asynchronous reactions

---

# Step 8 — Response Serialization

The controller return value is converted into an HTTP response.

Examples:

Controller return value:

```
{
  id: 42,
  name: "Alice"
}
```

Serialized response:

```
HTTP/1.1 200 OK
Content-Type: application/json

{
  "id": 42,
  "name": "Alice"
}
```

Errors may be converted into structured responses.

Example:

```
{
  "error": {
    "code": "NOT_FOUND",
    "message": "User not found"
  }
}
```

---

# Step 9 — Logging

During the lifecycle, structured logs may be generated.

Typical log fields:

```
requestId
method
path
duration
status
```

Example log entry:

```
{
  "requestId": "req-123",
  "method": "GET",
  "path": "/users/42",
  "status": 200,
  "duration": 12
}
```

---

# Step 10 — Response Sent

The HTTP response is returned to the client.

The request lifecycle ends at this point.

Any asynchronous tasks (events, background jobs) may continue
independently of the request.

---

# Error Handling

Errors may occur at different stages.

Typical categories:

```
Routing errors
Authentication errors
Authorization errors
Validation errors
Internal server errors
```

Framework behavior:

```
400 → validation error
401 → authentication error
403 → authorization error
404 → route not found
500 → internal error
```

Errors should always be logged and converted into structured responses.

---

# Observability

Several mechanisms provide insight into the request lifecycle:

```
structured logs
EventBus events
ops endpoints
metrics
```

These tools help operators and developers understand runtime behavior.

---

# Summary

The Expresto request lifecycle is designed to be:

- predictable
- extensible
- observable

Core stages:

```
Request
→ Router
→ Controller
→ Security Hooks
→ Business Logic
→ Events
→ Response
```

Understanding this lifecycle is essential when extending the framework
or implementing custom controllers.
