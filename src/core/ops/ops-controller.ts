import express from 'express';
import { routeRegistry, RegisteredRoute } from '../../lib/routing/route-registry';
import { readLogTail } from './log-reader';
import path from 'node:path';
import { readPublicConfig } from './config-reader';

const router = express.Router();

router.get('/__routes', (_req, res) => {
  const routes = routeRegistry.getRoutes();

  const result = routes.map((r: RegisteredRoute) => ({
    method: r.method,
    fullPath: r.path,
    secure: r.secure,
    source: r.source ?? 'unknown',
  }));

  res.json(result);
});

router.get('/__config', (_req, res) => {
  try {
    res.json(readPublicConfig());
  } catch (err) {
    res.status(500).json({ error: `Could not read config: ${String(err)}` });
  }
});

router.get('/__logs/:type', async (req, res) => {
  const { type } = req.params;
  const lines = Number.parseInt(req.query.lines as string, 10);
  const lineCount = Number.isFinite(lines) && lines > 0 ? lines : 50;

  if (!['application', 'access'].includes(type)) {
    return res.status(404).json({ error: `Log type '${type}' not found` });
  }

  const filePath = path.join('logs', `${type}.log`);

  try {
    const content = await readLogTail(filePath, lineCount);
    res.type('text/plain').send(content);
  } catch (err) {
    res.status(500).json({ error: `Could not read log: ${String(err)}` });
  }
});

export default router;
