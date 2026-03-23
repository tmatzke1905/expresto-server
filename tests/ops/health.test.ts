import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import path from 'node:path';
import type { Application } from 'express';
import { createServer } from '../../src/index';

describe('Ops: Health endpoint', () => {
  let app: Application;

  beforeAll(async () => {
    const cfg = path.resolve(__dirname, '../fixtures/security-basic.json');
    const server = await createServer(cfg);
    app = server.app;
  });

  it('returns status ok and uptime', async () => {
    const res = await request(app).get('/api/__health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.pid).toBe(process.pid);
    expect(res.body.uptime).toBeGreaterThan(0);
    expect(Array.isArray(res.body.services)).toBe(true);
    expect(res.body.cluster).toEqual(
      expect.objectContaining({
        configured: false,
        active: false,
        role: 'single',
      })
    );
  });
});
