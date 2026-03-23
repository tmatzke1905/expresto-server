import os from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

function restoreEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }

  for (const [key, value] of Object.entries(originalEnv)) {
    process.env[key] = value;
  }
}

afterEach(() => {
  restoreEnv();
  vi.restoreAllMocks();
  vi.resetModules();
  vi.doUnmock('node:cluster');
});

describe('cluster runtime context', () => {
  it('uses the configured worker count when present', async () => {
    const { resolveClusterWorkerCount } = await import('../../../src/lib/cluster/context');

    expect(resolveClusterWorkerCount({ workers: 3 })).toBe(3);
  });

  it('falls back to os.availableParallelism() for worker count defaults', async () => {
    vi.spyOn(os, 'availableParallelism').mockReturnValue(6);
    const { resolveClusterWorkerCount } = await import('../../../src/lib/cluster/context');

    expect(resolveClusterWorkerCount()).toBe(6);
  });

  it('reports a single-process runtime when cluster mode is not active', async () => {
    vi.spyOn(os, 'availableParallelism').mockReturnValue(4);
    const { resolveClusterRuntimeInfo } = await import('../../../src/lib/cluster/context');

    const info = resolveClusterRuntimeInfo({
      cluster: { enabled: true, workers: 2 },
    });

    expect(info).toEqual({
      configured: true,
      active: false,
      role: 'single',
      pid: process.pid,
      primaryPid: process.pid,
      workerId: undefined,
      workerOrdinal: undefined,
      workerCount: 2,
      schedulerLeader: false,
    });
  });

  it('reports worker metadata when started by the clustered runtime bootstrap', async () => {
    vi.doMock('node:cluster', () => ({
      default: {
        isWorker: true,
        worker: { id: 7 },
      },
    }));

    process.env.EXPRESTO_CLUSTER_ENABLED = 'true';
    process.env.EXPRESTO_CLUSTER_WORKER_COUNT = '5';
    process.env.EXPRESTO_CLUSTER_WORKER_ORDINAL = '2';
    process.env.EXPRESTO_CLUSTER_SCHEDULER_LEADER = 'true';
    process.env.EXPRESTO_CLUSTER_PRIMARY_PID = '9911';

    const { resolveClusterRuntimeInfo } = await import('../../../src/lib/cluster/context');
    const info = resolveClusterRuntimeInfo({
      cluster: { enabled: true },
    });

    expect(info).toEqual({
      configured: true,
      active: true,
      role: 'worker',
      pid: process.pid,
      primaryPid: 9911,
      workerId: 7,
      workerOrdinal: 2,
      workerCount: 5,
      schedulerLeader: true,
    });
  });
});
