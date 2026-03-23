import { EventEmitter } from 'node:events';
import log4js from 'log4js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLUSTER_ENV } from '../../../src/lib/cluster/context';
import {
  ClusterPrimaryManager,
  validateClusterRuntimeConfig,
} from '../../../src/lib/cluster/runtime';
import type { AppConfig } from '../../../src/lib/config';
import type { AppLogger } from '../../../src/lib/logger';

class FakeWorker {
  exitedAfterDisconnect = false;

  readonly process = {
    pid: 0,
    kill: vi.fn((_signal?: NodeJS.Signals) => true),
  };

  constructor(readonly id: number) {
    this.process.pid = 4000 + id;
  }
}

class FakeClusterAdapter extends EventEmitter {
  readonly setupPrimary = vi.fn();
  readonly forks: Array<{ worker: FakeWorker; env: Record<string, string> }> = [];

  fork(env: Record<string, string> = {}): FakeWorker {
    const worker = new FakeWorker(this.forks.length + 1);
    this.forks.push({ worker, env });
    return worker;
  }
}

function createLogger(): AppLogger {
  return {
    app: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      fatal: vi.fn(),
    },
    access: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      fatal: vi.fn(),
    },
  } as unknown as AppLogger;
}

function createConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 3000,
    host: '127.0.0.1',
    contextRoot: '/api',
    controllersPath: './tests/controllers',
    log: {
      access: './tests/logs/access.log',
      application: './tests/logs/application.log',
      level: 'ERROR',
    },
    auth: { jwt: { enabled: false }, basic: { enabled: false } },
    ...overrides,
  } as AppConfig;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('cluster runtime config validation', () => {
  it('rejects standalone scheduler mode when cluster mode is enabled', () => {
    expect(() =>
      validateClusterRuntimeConfig(
        createConfig({
          cluster: { enabled: true },
          scheduler: {
            enabled: true,
            mode: 'standalone',
            jobs: {},
          },
        })
      )
    ).toThrow('[Cluster] scheduler.mode="standalone" is not supported with cluster.enabled');
  });

  it('rejects WebSockets in clustered mode', () => {
    expect(() =>
      validateClusterRuntimeConfig(
        createConfig({
          cluster: { enabled: true },
          websocket: { enabled: true },
        })
      )
    ).toThrow('[Cluster] websocket.enabled is not supported with cluster.enabled');
  });
});

describe('ClusterPrimaryManager', () => {
  it('spawns workers with deterministic cluster environment and resolves readiness', async () => {
    const clusterAdapter = new FakeClusterAdapter();
    const logger = createLogger();
    vi.spyOn(process, 'on').mockReturnValue(process);
    vi.spyOn(process, 'off').mockReturnValue(process);

    const manager = new ClusterPrimaryManager(
      createConfig({
        cluster: {
          enabled: true,
          workers: 2,
        },
      }),
      logger,
      clusterAdapter
    );

    await manager.start();

    expect(clusterAdapter.setupPrimary).toHaveBeenCalled();
    expect(clusterAdapter.forks).toHaveLength(2);
    expect(clusterAdapter.forks[0]?.env).toMatchObject({
      [CLUSTER_ENV.enabled]: 'true',
      [CLUSTER_ENV.workerCount]: '2',
      [CLUSTER_ENV.workerOrdinal]: '1',
      [CLUSTER_ENV.schedulerLeader]: 'true',
      [CLUSTER_ENV.primaryPid]: String(process.pid),
    });
    expect(clusterAdapter.forks[1]?.env).toMatchObject({
      [CLUSTER_ENV.workerOrdinal]: '2',
      [CLUSTER_ENV.schedulerLeader]: 'false',
    });

    let ready = false;
    const readyPromise = manager.waitUntilReady().then(() => {
      ready = true;
    });

    clusterAdapter.emit('listening', clusterAdapter.forks[0]?.worker, null);
    await Promise.resolve();
    expect(ready).toBe(false);

    clusterAdapter.emit('listening', clusterAdapter.forks[1]?.worker, null);
    await readyPromise;
    expect(ready).toBe(true);
  });

  it('respawns unexpected worker exits and preserves the scheduler leader slot', async () => {
    const clusterAdapter = new FakeClusterAdapter();
    const logger = createLogger();
    vi.spyOn(process, 'on').mockReturnValue(process);
    vi.spyOn(process, 'off').mockReturnValue(process);

    const manager = new ClusterPrimaryManager(
      createConfig({
        cluster: {
          enabled: true,
          workers: 1,
          maxRestarts: 2,
        },
      }),
      logger,
      clusterAdapter
    );

    await manager.start();
    const firstWorker = clusterAdapter.forks[0]?.worker;

    clusterAdapter.emit('exit', firstWorker, 1, null);
    await Promise.resolve();

    expect(clusterAdapter.forks).toHaveLength(2);
    expect(clusterAdapter.forks[1]?.worker.id).not.toBe(firstWorker.id);
    expect(clusterAdapter.forks[1]?.env).toMatchObject({
      [CLUSTER_ENV.schedulerLeader]: 'true',
      [CLUSTER_ENV.workerOrdinal]: '1',
    });
  });

  it('does not respawn workers when respawn is disabled and rejects readiness', async () => {
    const clusterAdapter = new FakeClusterAdapter();
    const logger = createLogger();
    vi.spyOn(process, 'on').mockReturnValue(process);
    vi.spyOn(process, 'off').mockReturnValue(process);

    const manager = new ClusterPrimaryManager(
      createConfig({
        cluster: {
          enabled: true,
          workers: 1,
          respawn: false,
        },
      }),
      logger,
      clusterAdapter
    );

    await manager.start();
    const firstWorker = clusterAdapter.forks[0]?.worker;

    const readyPromise = manager.waitUntilReady();
    clusterAdapter.emit('exit', firstWorker, 1, null);

    await expect(readyPromise).rejects.toThrow(
      '[Cluster] worker slot 1 exited before the cluster reached a ready state'
    );
    expect(clusterAdapter.forks).toHaveLength(1);
  });

  it('signals workers during shutdown and exits the primary process', async () => {
    const clusterAdapter = new FakeClusterAdapter();
    const logger = createLogger();
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(((_code?: number) => undefined as never) as (code?: number) => never);
    vi.spyOn(process, 'on').mockReturnValue(process);
    vi.spyOn(process, 'off').mockReturnValue(process);
    vi.spyOn(
      log4js as typeof log4js & { shutdown: (callback: () => void) => void },
      'shutdown'
    ).mockImplementation(callback => callback());

    const manager = new ClusterPrimaryManager(
      createConfig({
        cluster: {
          enabled: true,
          workers: 2,
          workerShutdownTimeoutMs: 1,
        },
      }),
      logger,
      clusterAdapter
    );

    await manager.start();
    await manager.shutdown('test-shutdown', 0);

    expect(clusterAdapter.forks[0]?.worker.process.kill).toHaveBeenCalledWith('SIGTERM');
    expect(clusterAdapter.forks[1]?.worker.process.kill).toHaveBeenCalledWith('SIGTERM');
    expect(clusterAdapter.forks[0]?.worker.process.kill).toHaveBeenCalledWith('SIGKILL');
    expect(clusterAdapter.forks[1]?.worker.process.kill).toHaveBeenCalledWith('SIGKILL');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});
