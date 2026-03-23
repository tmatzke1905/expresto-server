import cluster from 'node:cluster';
import log4js from 'log4js';
import type { AddressInfo } from 'node:net';
import type { AppConfig } from '../config';
import type { AppLogger } from '../logger';
import { CLUSTER_ENV, resolveClusterWorkerCount } from './context';

type Log4jsWithShutdown = typeof log4js & { shutdown?: (callback: () => void) => void };

export const CLUSTER_WORKER_READY_MESSAGE = 'expresto-cluster-worker-ready';

export interface ClusterPrimaryRuntime {
  mode: 'cluster-primary';
  config: AppConfig;
  logger: AppLogger;
  workerCount: number;
  waitUntilReady: () => Promise<void>;
  shutdown: (reason?: string, exitCode?: number) => Promise<void>;
}

type ClusterWorkerLike = {
  id: number;
  process: {
    pid: number;
    kill: (signal?: NodeJS.Signals) => boolean;
  };
  exitedAfterDisconnect?: boolean;
};

type ClusterEventMap = {
  listening: (worker: ClusterWorkerLike, address: AddressInfo | string | null) => void;
  exit: (worker: ClusterWorkerLike, code: number | null, signal: NodeJS.Signals | null) => void;
  message: (worker: ClusterWorkerLike, message: unknown) => void;
};

type ClusterAdapter = {
  fork: (env?: Record<string, string>) => ClusterWorkerLike;
  on: <TEvent extends keyof ClusterEventMap>(
    event: TEvent,
    listener: ClusterEventMap[TEvent]
  ) => unknown;
  off?: <TEvent extends keyof ClusterEventMap>(
    event: TEvent,
    listener: ClusterEventMap[TEvent]
  ) => unknown;
  setupPrimary?: (settings: { exec?: string; args?: string[] }) => void;
};

type WorkerSlot = {
  ordinal: number;
  restartCount: number;
  schedulerLeader: boolean;
  worker?: ClusterWorkerLike;
};

/**
 * Validates cluster-specific combinations before the runtime forks workers.
 *
 * The clustered runtime deliberately stays conservative:
 * - attached scheduler jobs run on exactly one worker
 * - scheduler-only standalone mode is rejected because it would not have a
 *   sensible primary/worker ownership model
 * - WebSocket clustering is rejected until a sticky-session + adapter story is
 *   part of the supported surface
 */
export function validateClusterRuntimeConfig(config: AppConfig): void {
  if (!config.cluster?.enabled) {
    return;
  }

  if (config.scheduler?.enabled && config.scheduler.mode === 'standalone') {
    throw new Error(
      '[Cluster] scheduler.mode="standalone" is not supported with cluster.enabled; use attached mode'
    );
  }

  if (config.websocket?.enabled) {
    throw new Error(
      '[Cluster] websocket.enabled is not supported with cluster.enabled; disable WebSockets or run a single worker'
    );
  }
}

/**
 * Central cluster manager used by the CLI bootstrap path.
 *
 * The primary process owns worker supervision only. Workers run the normal
 * `createServer()` bootstrap and stay responsible for graceful app shutdown.
 */
export class ClusterPrimaryManager implements ClusterPrimaryRuntime {
  readonly mode = 'cluster-primary' as const;
  readonly workerCount: number;

  private readonly cluster: ClusterAdapter;
  private readonly config: AppConfig;
  private readonly logger: AppLogger;
  private readonly slots = new Map<number, WorkerSlot>();
  private readonly workerToSlot = new Map<number, number>();
  private readonly readySlots = new Set<number>();
  private readonly maxRestarts: number;
  private readonly respawnWorkers: boolean;
  private readonly workerShutdownTimeoutMs: number;

  private readonly readyPromise: Promise<void>;
  private resolveReady!: () => void;
  private rejectReady!: (error: unknown) => void;

  private shuttingDown = false;
  private shutdownPromise?: Promise<void>;
  private readySettled = false;

  private readonly onListeningBound: ClusterEventMap['listening'];
  private readonly onExitBound: ClusterEventMap['exit'];
  private readonly onMessageBound: ClusterEventMap['message'];
  private readonly onSigintBound: () => void;
  private readonly onSigtermBound: () => void;

  constructor(config: AppConfig, logger: AppLogger, clusterAdapter: ClusterAdapter = cluster) {
    validateClusterRuntimeConfig(config);

    this.config = config;
    this.logger = logger;
    this.cluster = clusterAdapter;
    this.workerCount = resolveClusterWorkerCount(config.cluster);
    this.maxRestarts = config.cluster?.maxRestarts ?? this.workerCount;
    this.respawnWorkers = config.cluster?.respawn !== false;
    this.workerShutdownTimeoutMs = config.cluster?.workerShutdownTimeoutMs ?? 10_000;

    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.resolveReady = () => {
        if (this.readySettled) return;
        this.readySettled = true;
        resolve();
      };
      this.rejectReady = error => {
        if (this.readySettled) return;
        this.readySettled = true;
        reject(error);
      };
    });

    this.onListeningBound = worker => this.onWorkerListening(worker);
    this.onExitBound = (worker, code, signal) => {
      void this.onWorkerExit(worker, code, signal);
    };
    this.onMessageBound = (worker, message) => {
      this.onWorkerMessage(worker, message);
    };
    this.onSigintBound = () => {
      void this.shutdown('SIGINT');
    };
    this.onSigtermBound = () => {
      void this.shutdown('SIGTERM');
    };
  }

  async start(): Promise<ClusterPrimaryRuntime> {
    this.installHandlers();

    // Preserve the original script and args explicitly so worker bootstrap is
    // deterministic in direct `node`, npm script, and ts-node based tests.
    if (typeof this.cluster.setupPrimary === 'function' && process.argv[1]) {
      this.cluster.setupPrimary({
        exec: process.argv[1],
        args: process.argv.slice(2),
      });
    }

    for (let ordinal = 0; ordinal < this.workerCount; ordinal += 1) {
      this.spawnWorker(ordinal, ordinal === 0);
    }

    return this;
  }

  waitUntilReady(): Promise<void> {
    return this.readyPromise;
  }

  async shutdown(reason = 'cluster-primary-shutdown', exitCode = 0): Promise<void> {
    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }

    this.shuttingDown = true;
    this.shutdownPromise = this.performShutdown(reason, exitCode);
    return this.shutdownPromise;
  }

  private installHandlers(): void {
    this.cluster.on('listening', this.onListeningBound);
    this.cluster.on('exit', this.onExitBound);
    this.cluster.on('message', this.onMessageBound);
    process.on('SIGINT', this.onSigintBound);
    process.on('SIGTERM', this.onSigtermBound);
  }

  private uninstallHandlers(): void {
    this.cluster.off?.('listening', this.onListeningBound);
    this.cluster.off?.('exit', this.onExitBound);
    this.cluster.off?.('message', this.onMessageBound);
    process.off('SIGINT', this.onSigintBound);
    process.off('SIGTERM', this.onSigtermBound);
  }

  private spawnWorker(ordinal: number, schedulerLeader: boolean): ClusterWorkerLike {
    const worker = this.cluster.fork({
      [CLUSTER_ENV.enabled]: 'true',
      [CLUSTER_ENV.workerCount]: String(this.workerCount),
      [CLUSTER_ENV.workerOrdinal]: String(ordinal + 1),
      [CLUSTER_ENV.schedulerLeader]: String(schedulerLeader),
      [CLUSTER_ENV.primaryPid]: String(process.pid),
    });

    const slot = this.slots.get(ordinal) ?? {
      ordinal,
      restartCount: 0,
      schedulerLeader,
    };

    slot.schedulerLeader = schedulerLeader;
    slot.worker = worker;

    this.slots.set(ordinal, slot);
    this.workerToSlot.set(worker.id, ordinal);

    this.logger.app.info('[Cluster] worker spawned', {
      workerId: worker.id,
      pid: worker.process.pid,
      workerOrdinal: ordinal + 1,
      workerCount: this.workerCount,
      schedulerLeader,
    });

    return worker;
  }

  private onWorkerListening(worker: ClusterWorkerLike): void {
    this.markWorkerReady(worker);
  }

  private onWorkerMessage(worker: ClusterWorkerLike, message: unknown): void {
    if (
      !message ||
      typeof message !== 'object' ||
      !('type' in message) ||
      (message as { type?: unknown }).type !== CLUSTER_WORKER_READY_MESSAGE
    ) {
      return;
    }

    this.markWorkerReady(worker);
  }

  private markWorkerReady(worker: ClusterWorkerLike): void {
    const slotId = this.workerToSlot.get(worker.id);
    if (slotId === undefined) {
      return;
    }

    this.readySlots.add(slotId);
    if (this.readySlots.size >= this.workerCount) {
      this.resolveReady();
    }
  }

  private async onWorkerExit(
    worker: ClusterWorkerLike,
    code: number | null,
    signal: NodeJS.Signals | null
  ): Promise<void> {
    const slotId = this.workerToSlot.get(worker.id);
    if (slotId === undefined) {
      return;
    }

    this.workerToSlot.delete(worker.id);
    this.readySlots.delete(slotId);

    const slot = this.slots.get(slotId);
    if (!slot) {
      return;
    }

    const wasLeader = slot.schedulerLeader;
    slot.worker = undefined;

    this.logger.app.warn('[Cluster] worker exited', {
      workerId: worker.id,
      pid: worker.process.pid,
      code,
      signal,
      workerOrdinal: slot.ordinal + 1,
      schedulerLeader: wasLeader,
      shuttingDown: this.shuttingDown,
    });

    const unexpectedExit = !this.shuttingDown && worker.exitedAfterDisconnect !== true;
    if (!unexpectedExit) {
      return;
    }

    if (!this.respawnWorkers) {
      this.rejectReady(
        new Error(
          `[Cluster] worker slot ${slot.ordinal + 1} exited before the cluster reached a ready state`
        )
      );
      this.logger.app.warn('[Cluster] worker respawn disabled; capacity reduced', {
        workerOrdinal: slot.ordinal + 1,
      });
      return;
    }

    slot.restartCount += 1;
    if (slot.restartCount > this.maxRestarts) {
      const err = new Error(
        `[Cluster] worker slot ${slot.ordinal + 1} exceeded restart limit (${this.maxRestarts})`
      );
      this.rejectReady(err);
      this.logger.app.fatal(err.message);
      await this.shutdown('restart_limit_exceeded', 1);
      return;
    }

    this.spawnWorker(slot.ordinal, wasLeader);
  }

  private async performShutdown(reason: string, exitCode: number): Promise<void> {
    this.logger.app.warn('[Cluster] starting graceful primary shutdown', {
      reason,
      workerCount: this.workerCount,
    });

    this.uninstallHandlers();

    const workers = Array.from(this.slots.values())
      .map(slot => slot.worker)
      .filter((worker): worker is ClusterWorkerLike => Boolean(worker));

    for (const worker of workers) {
      worker.process.kill('SIGTERM');
    }

    await Promise.race([
      Promise.all(workers.map(worker => this.waitForWorkerExit(worker.id))),
      this.delay(this.workerShutdownTimeoutMs),
    ]);

    for (const worker of Array.from(this.slots.values())
      .map(slot => slot.worker)
      .filter(Boolean) as ClusterWorkerLike[]) {
      worker.process.kill('SIGKILL');
    }

    await this.flushLogger();
    process.exit(exitCode);
  }

  private waitForWorkerExit(workerId: number): Promise<void> {
    if (!this.workerToSlot.has(workerId)) {
      return Promise.resolve();
    }

    return new Promise(resolve => {
      const listener: ClusterEventMap['exit'] = worker => {
        if (worker.id !== workerId) {
          return;
        }

        this.cluster.off?.('exit', listener);
        resolve();
      };

      this.cluster.on('exit', listener);
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => {
      setTimeout(resolve, ms);
    });
  }

  private async flushLogger(): Promise<void> {
    await new Promise<void>(resolve => {
      try {
        (log4js as Log4jsWithShutdown).shutdown?.(() => resolve());
      } catch {
        resolve();
      }
    });
  }
}
