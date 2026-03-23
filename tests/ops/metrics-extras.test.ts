import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import path from 'node:path';
import type { Application } from 'express';
import { createServer } from '../../src/index';

function parseMetrics(text: string): Record<string, number> {
  const result: Record<string, number> = {};
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(\w+)(\{[^}]*\})?\s+([0-9.eE+-]+)$/);
    if (m) {
      const [, name, labels, value] = m;
      const key = labels ? `${name}${labels}` : name;
      const num = Number(value);
      if (!Number.isNaN(num)) result[key] = num;
    }
  }
  return result;
}

describe('Ops: Prometheus extra metrics (routes/services/conflicts)', () => {
  let app: Application;

  beforeAll(async () => {
    const cfg = path.resolve(__dirname, '../fixtures/security-basic.json');
    const server = await createServer(cfg);
    app = server.app;
  });

  it('exposes services_registered_total and it is a number', async () => {
    const res = await request(app).get('/__metrics');
    expect(res.status).toBe(200);
    const map = parseMetrics(res.text);
    const key = Object.keys(map).find(k => k.startsWith('services_registered_total'));
    expect(key).toBeTruthy();
    expect(typeof map[key!]).toBe('number');
    expect(map[key!]).toBeGreaterThanOrEqual(0);
  });

  it('exposes routes_registered_total with method/secure labels', async () => {
    const res = await request(app).get('/__metrics');
    const map = parseMetrics(res.text);

    const hasGetBasic = Object.keys(map).some(
      k =>
        k.startsWith('routes_registered_total{') &&
        k.includes('method="get"') &&
        k.includes('secure="basic"')
    );
    const hasGetJwt = Object.keys(map).some(
      k =>
        k.startsWith('routes_registered_total{') &&
        k.includes('method="get"') &&
        k.includes('secure="jwt"')
    );

    expect(hasGetBasic).toBe(true);
    expect(hasGetJwt).toBe(true);
  });

  it('exposes route_conflicts_total and it should be 0 for our setup', async () => {
    const res = await request(app).get('/__metrics');
    const map = parseMetrics(res.text);
    const val = map['route_conflicts_total'];
    expect(typeof val).toBe('number');
    expect(val).toBeGreaterThanOrEqual(0);
    expect(val).toBe(0);
  });

  it('exposes cluster metadata metrics for the current process', async () => {
    const res = await request(app).get('/__metrics');
    const map = parseMetrics(res.text);

    const infoKey = Object.keys(map).find(
      key =>
        key.startsWith('cluster_worker_info{') &&
        key.includes('role="single"') &&
        key.includes('scheduler_leader="false"')
    );

    expect(infoKey).toBeTruthy();
    expect(map[infoKey!]).toBe(1);
    expect(map['cluster_workers_configured_total']).toBeGreaterThanOrEqual(1);
  });
});
