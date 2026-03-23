# Metrics and Monitoring

expresto-server includes built-in Prometheus metrics and lightweight OpenTelemetry
request tracing.

## Prometheus

By default, the runtime exposes:

```txt
GET /__metrics
```

Configuration:

```json
{
  "metrics": {
    "enabled": true,
    "endpoint": "/__metrics"
  }
}
```

Behavior:

- `metrics.enabled` is opt-out, not opt-in
- the endpoint is mounted outside `contextRoot`
- the endpoint is not covered by ops security settings
- set `metrics.enabled: false` to disable the endpoint entirely

Built-in Prometheus metrics include:

- `http_requests_total`
- `http_request_duration_seconds`
- `http_errors_total`
- `http_requests_in_flight`
- `services_registered_total`
- `routes_registered_total`
- `route_conflicts_total`
- `cluster_worker_info`
- `cluster_workers_configured_total`

Cluster note:

- metrics stay process-local in clustered runtimes
- `cluster_worker_info` tells you which worker produced the sample
- shared-port scrapes are not pre-aggregated across workers

## OpenTelemetry

OpenTelemetry request spans are controlled through:

```json
{
  "telemetry": {
    "enabled": true,
    "serviceName": "my-service"
  }
}
```

Current instrumentation covers:

- the HTTP request middleware path
- manual spans you create yourself

## Operational Advice

- Treat `/__metrics` as an infrastructure endpoint and protect it at the
  network, proxy, or ingress layer if you expose it publicly.
- Disable Prometheus metrics when you do not scrape them.
- Use built-in route and service gauges to spot registration drift at startup.

_Last updated: 2026-03-23_
