import { fork, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '../..');
const runnerPath = path.join(repoRoot, 'tests/cluster/cluster-runtime-runner.ts');

type WorkerRuntimeReadyMessage = {
  type: 'worker-runtime-ready';
  pid: number;
  leader: boolean;
  ordinal: number;
};

type RunnerMessage =
  | { type: 'ready'; workerCount: number }
  | { type: 'error'; message: string }
  | { type: 'worker-event'; workerId: number; workerMessage: unknown };

const childProcesses = new Set<ChildProcess>();

afterEach(async () => {
  await Promise.all(Array.from(childProcesses, child => terminateChild(child)));
  childProcesses.clear();
});

function writeClusterConfig(tmpDir: string): string {
  const configPath = path.join(tmpDir, 'middleware.config.json');
  const logsDir = path.join(tmpDir, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });

  fs.writeFileSync(
    configPath,
    JSON.stringify(
      {
        port: 3000,
        host: '127.0.0.1',
        contextRoot: '/api',
        controllersPath: path.join(repoRoot, 'tests/controllers'),
        log: {
          access: path.join(logsDir, 'access.log'),
          application: path.join(logsDir, 'application.log'),
          level: 'fatal',
          traceRequests: false,
        },
        cors: { enabled: false, options: {} },
        helmet: { enabled: false, options: {} },
        rateLimit: { enabled: false, options: {} },
        metrics: { enabled: false, endpoint: '/__metrics' },
        telemetry: { enabled: false },
        auth: { jwt: { enabled: false }, basic: { enabled: false } },
        cluster: {
          enabled: true,
          workers: 2,
          workerShutdownTimeoutMs: 250,
          maxRestarts: 3,
        },
      },
      null,
      2
    ),
    'utf8'
  );

  return configPath;
}

function startClusterProcess(configPath: string, crashFile: string): ChildProcess {
  const child = fork(runnerPath, [configPath], {
    cwd: repoRoot,
    execArgv: ['-r', 'ts-node/register/transpile-only'],
    env: {
      ...process.env,
      EXPRESTO_CLUSTER_TEST_CRASH_FILE: crashFile,
    },
    silent: true,
  });

  childProcesses.add(child);
  return child;
}

function onceProcessExit(
  child: ChildProcess
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise(resolve => {
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
}

async function terminateChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.killed) {
    return;
  }

  const exited = onceProcessExit(child);
  child.kill('SIGKILL');
  await exited;
}

function waitForClusterReady(
  child: ChildProcess,
  timeoutMs = 20_000
): Promise<{ workerCount: number }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for clustered runtime bootstrap'));
    }, timeoutMs);

    const onMessage = (message: RunnerMessage) => {
      if (message.type === 'error') {
        cleanup();
        reject(new Error(message.message));
        return;
      }

      if (message.type !== 'ready') {
        return;
      }

      cleanup();
      resolve({ workerCount: message.workerCount });
    };

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      cleanup();
      reject(new Error(`Cluster process exited before readiness (code=${code}, signal=${signal})`));
    };

    const cleanup = () => {
      clearTimeout(timer);
      child.off('message', onMessage);
      child.off('exit', onExit);
    };

    child.on('message', onMessage);
    child.on('exit', onExit);
  });
}

function createWorkerRuntimeMessageCollector(child: ChildProcess) {
  const messages: WorkerRuntimeReadyMessage[] = [];
  const waiters = new Set<{
    predicate: (messages: WorkerRuntimeReadyMessage[]) => boolean;
    resolve: (messages: WorkerRuntimeReadyMessage[]) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }>();

  const settleWaiters = () => {
    for (const waiter of Array.from(waiters)) {
      if (!waiter.predicate(messages)) {
        continue;
      }

      clearTimeout(waiter.timer);
      waiters.delete(waiter);
      waiter.resolve([...messages]);
    }
  };

  const onMessage = (message: RunnerMessage) => {
    if (message.type === 'error') {
      const err = new Error(message.message);
      for (const waiter of Array.from(waiters)) {
        clearTimeout(waiter.timer);
        waiters.delete(waiter);
        waiter.reject(err);
      }
      return;
    }

    if (message.type !== 'worker-event') {
      return;
    }

    const workerMessage = message.workerMessage as { type?: unknown } | undefined;
    if (!workerMessage || workerMessage.type !== 'worker-runtime-ready') {
      return;
    }

    messages.push(message.workerMessage as WorkerRuntimeReadyMessage);
    settleWaiters();
  };

  const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
    const err = new Error(`Cluster process exited early (code=${code}, signal=${signal})`);
    for (const waiter of Array.from(waiters)) {
      clearTimeout(waiter.timer);
      waiters.delete(waiter);
      waiter.reject(err);
    }
  };

  child.on('message', onMessage);
  child.on('exit', onExit);

  return {
    waitFor(
      predicate: (messages: WorkerRuntimeReadyMessage[]) => boolean,
      timeoutMs = 20_000
    ): Promise<WorkerRuntimeReadyMessage[]> {
      if (predicate(messages)) {
        return Promise.resolve([...messages]);
      }

      return new Promise((resolve, reject) => {
        const waiter = {
          predicate,
          resolve,
          reject,
          timer: setTimeout(() => {
            waiters.delete(waiter);
            reject(new Error('Timed out waiting for worker runtime messages'));
          }, timeoutMs),
        };

        waiters.add(waiter);
      });
    },
    dispose(): void {
      for (const waiter of Array.from(waiters)) {
        clearTimeout(waiter.timer);
        waiters.delete(waiter);
        waiter.reject(new Error('Worker runtime message collector disposed'));
      }

      child.off('message', onMessage);
      child.off('exit', onExit);
    },
  };
}

describe('clustered runtime integration', () => {
  it('boots the primary/worker runtime in a child process, respawns a crashed leader worker, and shuts down cleanly', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'expresto-cluster-integration-'));
    const crashFile = path.join(tmpDir, 'leader-crashed.flag');
    const configPath = writeClusterConfig(tmpDir);
    const child = startClusterProcess(configPath, crashFile);
    const workerMessages = createWorkerRuntimeMessageCollector(child);

    const initialWorkersPromise = workerMessages.waitFor(
      messages => {
        const uniquePids = new Set(messages.map(message => message.pid));
        return uniquePids.size >= 2;
      },
      20_000
    );

    const ready = await waitForClusterReady(child);
    expect(ready.workerCount).toBe(2);

    const initialWorkers = await initialWorkersPromise;
    const initialSnapshot = Array.from(
      new Map(initialWorkers.map(message => [message.pid, message])).values()
    );

    expect(initialSnapshot).toHaveLength(2);
    expect(initialSnapshot.filter(message => message.leader)).toHaveLength(1);
    expect(initialSnapshot.map(message => message.ordinal).sort()).toEqual([1, 2]);

    const restartedWorkers = await workerMessages.waitFor(
      messages => {
        const uniquePids = new Set(messages.map(message => message.pid));
        return Array.from(uniquePids).some(
          pid => !initialSnapshot.some(message => message.pid === pid)
        );
      },
      20_000
    );

    const respawnedWorker = restartedWorkers.find(
      message => !initialSnapshot.some(initial => initial.pid === message.pid)
    );

    expect(respawnedWorker).toBeDefined();
    expect(respawnedWorker?.leader).toBe(true);
    expect(fs.existsSync(crashFile)).toBe(true);
    expect(child.exitCode).toBeNull();

    const exitPromise = onceProcessExit(child);
    child.kill('SIGTERM');

    const { code, signal } = await exitPromise;
    workerMessages.dispose();
    expect(code).toBe(0);
    expect(signal).toBeNull();
  }, 30_000);
});
