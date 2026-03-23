import cluster from 'node:cluster';
import fs from 'node:fs';
import { loadConfig } from '../../src/lib/config';
import { CLUSTER_ENV } from '../../src/lib/cluster/context';
import { startConfiguredRuntime } from '../../src/lib/runtime-cli';

type MessageToParent = {
  type: string;
  workerId?: number;
  workerCount?: number;
  pid?: number;
  leader?: boolean;
  ordinal?: number;
  message?: string;
  workerMessage?: unknown;
};

function createLogger() {
  const noop = () => undefined;
  return {
    app: {
      info: noop,
      warn: noop,
      error: noop,
      debug: noop,
      fatal: noop,
    },
    access: {
      info: noop,
      warn: noop,
      error: noop,
      debug: noop,
      fatal: noop,
    },
  };
}

async function createFakeRuntime(configPath: string) {
  const config = await loadConfig(configPath);
  const logger = createLogger();

  let keepAlive: NodeJS.Timeout | undefined;
  let handlersInstalled = false;

  const stop = (code = 0) => {
    if (keepAlive) {
      clearInterval(keepAlive);
      keepAlive = undefined;
    }
    process.exit(code);
  };

  const installShutdownHandlers = () => {
    if (handlersInstalled) {
      return;
    }

    handlersInstalled = true;
    process.once('SIGTERM', () => stop(0));
    process.once('SIGINT', () => stop(0));
  };

  return {
    config,
    logger,
    app: {
      listen: (_port: number, _host: string, callback?: () => void) => {
        keepAlive = setInterval(() => undefined, 1_000);
        installShutdownHandlers();

        callback?.();

        const leader = process.env[CLUSTER_ENV.schedulerLeader] === 'true';
        const ordinal = Number(process.env[CLUSTER_ENV.workerOrdinal] ?? '0');
        process.send?.({
          type: 'worker-runtime-ready',
          pid: process.pid,
          leader,
          ordinal,
        } satisfies MessageToParent);

        const crashFile = process.env.EXPRESTO_CLUSTER_TEST_CRASH_FILE;
        if (leader && crashFile && !fs.existsSync(crashFile)) {
          fs.writeFileSync(crashFile, String(process.pid), 'utf8');
          setTimeout(() => {
            process.exit(1);
          }, 50).unref();
        }

        return {
          close: (done?: (err?: Error) => void) => {
            if (keepAlive) {
              clearInterval(keepAlive);
              keepAlive = undefined;
            }
            done?.();
          },
        };
      },
    },
  };
}

async function main(): Promise<void> {
  const configPath = process.argv[2];
  if (!configPath) {
    throw new Error('Missing config path');
  }

  if (cluster.isPrimary) {
    cluster.on('message', (worker, workerMessage) => {
      process.send?.({
        type: 'worker-event',
        workerId: worker.id,
        workerMessage,
      } satisfies MessageToParent);
    });
  }

  const runtime = await startConfiguredRuntime(createFakeRuntime, configPath);

  if ('mode' in runtime && runtime.mode === 'cluster-primary') {
    await runtime.waitUntilReady();
    process.send?.({
      type: 'ready',
      workerCount: runtime.workerCount,
    } satisfies MessageToParent);
  }
}

main().catch(err => {
  process.send?.({
    type: 'error',
    message: err instanceof Error ? err.message : String(err),
  } satisfies MessageToParent);
  console.error(err);
  process.exit(1);
});
