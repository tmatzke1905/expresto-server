import express from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import { getConfig, initConfig } from '../../src/lib/config';
import { createServer } from '../../src';

describe('Ops: __config endpoint', () => {
  let app: express.Express;

  beforeAll(async () => {
    // Integration-style test: boot the server with a known test config.
    await initConfig('./tests/config/basic.json');
    const server = await createServer(getConfig());
    app = server.app;
  });

  it('returns 200 and includes expected config structure', async () => {
    const res = await request(app).get('/api/__config');
    expect(res.status).toBe(200);
    expect(res.type).toMatch(/application\/json/);

    // Basic shape (do not overfit the schema here)
    expect(res.body).toHaveProperty('contextRoot');
    expect(res.body).toHaveProperty('log');
    expect(res.body).toHaveProperty('port');
  });

  it('redacts secret-like keys recursively', async () => {
    const res = await request(app).get('/api/__config');
    expect(res.status).toBe(200);

    // The redaction logic mirrors src/core/ops/config-reader.ts:
    // keys matching /(secret|password|token|key)/i are replaced with "***" (unless null/undefined).
    const seen: Array<{ path: string; value: unknown }> = [];

    const walk = (v: unknown, p: string) => {
      if (Array.isArray(v)) {
        v.forEach((x, i) => walk(x, `${p}[${i}]`));
        return;
      }
      if (v && typeof v === 'object') {
        for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
          const nextPath = p ? `${p}.${k}` : k;
          if (/(secret|password|token|key)/i.test(k)) {
            seen.push({ path: nextPath, value: val });
          }
          walk(val, nextPath);
        }
      }
    };

    walk(res.body, '');

    // If the config contains secret-like keys, they must be redacted.
    for (const x of seen) {
      if (x.value == null) continue;
      expect(x.value).toBe('***');
    }
  });
});
