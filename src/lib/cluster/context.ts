import cluster from 'node:cluster';
import os from 'node:os';
import type { AppConfig, ClusterConfig } from '../config';

/**
 * Environment variables written by the primary process and consumed by worker
 * runtimes. Keeping them centralized avoids stringly-typed access in the rest
 * of the runtime.
 */
export const CLUSTER_ENV = {
  enabled: 'EXPRESTO_CLUSTER_ENABLED',
  workerCount: 'EXPRESTO_CLUSTER_WORKER_COUNT',
  workerOrdinal: 'EXPRESTO_CLUSTER_WORKER_ORDINAL',
  schedulerLeader: 'EXPRESTO_CLUSTER_SCHEDULER_LEADER',
  primaryPid: 'EXPRESTO_CLUSTER_PRIMARY_PID',
} as const;

export type ClusterRuntimeRole = 'single' | 'worker';

/**
 * Stable runtime description that can be exposed in ops endpoints and reused by
 * scheduler / metrics code without reaching into `node:cluster` directly.
 */
export interface ClusterRuntimeInfo {
  configured: boolean;
  active: boolean;
  role: ClusterRuntimeRole;
  pid: number;
  primaryPid: number;
  workerId?: number;
  workerOrdinal?: number;
  workerCount: number;
  schedulerLeader: boolean;
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function parseInteger(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Normalizes the configured worker count so the cluster manager and worker
 * runtimes use the same defaulting rules.
 */
export function resolveClusterWorkerCount(config?: ClusterConfig): number {
  if (
    typeof config?.workers === 'number' &&
    Number.isFinite(config.workers) &&
    config.workers >= 1
  ) {
    return Math.max(1, Math.trunc(config.workers));
  }

  return Math.max(1, os.availableParallelism());
}

/**
 * Returns a stable process-local view of the current cluster state.
 *
 * Important distinction:
 * - `configured` means the config requested cluster mode.
 * - `active` means this process is actually running as a managed worker.
 *
 * This allows `createServer()` to stay import-friendly in tests while the
 * scheduler and ops endpoints can still explain whether they are running inside
 * the clustered CLI bootstrap or inside a plain single-process runtime.
 */
export function resolveClusterRuntimeInfo(
  config: Pick<AppConfig, 'cluster'> | undefined
): ClusterRuntimeInfo {
  const configured = config?.cluster?.enabled === true;
  const workerCount =
    parseInteger(process.env[CLUSTER_ENV.workerCount]) ??
    resolveClusterWorkerCount(config?.cluster);
  const workerOrdinal = parseInteger(process.env[CLUSTER_ENV.workerOrdinal]);
  const schedulerLeader = parseBoolean(process.env[CLUSTER_ENV.schedulerLeader]) ?? false;
  const primaryPid = parseInteger(process.env[CLUSTER_ENV.primaryPid]) ?? process.pid;
  const active =
    configured && cluster.isWorker && parseBoolean(process.env[CLUSTER_ENV.enabled]) === true;

  return {
    configured,
    active,
    role: active ? 'worker' : 'single',
    pid: process.pid,
    primaryPid,
    workerId: cluster.isWorker ? cluster.worker?.id : undefined,
    workerOrdinal,
    workerCount,
    schedulerLeader: active ? schedulerLeader : false,
  };
}
