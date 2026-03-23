import cluster from 'node:cluster';
import { loadConfig, type AppConfig } from './config';
import {
  CLUSTER_WORKER_READY_MESSAGE,
  ClusterPrimaryManager,
  type ClusterPrimaryRuntime,
  validateClusterRuntimeConfig,
} from './cluster/runtime';
import type { AppLogger } from './logger';
import { setupLogger } from './setupLogger';

type StartableApp = {
  listen: (port: number, host: string, callback?: () => void) => unknown;
};

type CliRuntime = {
  app: StartableApp;
  config: AppConfig;
  logger: AppLogger;
};

export type RuntimeBootstrapResult = CliRuntime | ClusterPrimaryRuntime;

async function startSingleProcessRuntime(
  createRuntime: (configPath: string) => Promise<CliRuntime>,
  configPath: string
): Promise<CliRuntime> {
  const runtime = await createRuntime(configPath);
  const { app, config, logger } = runtime;

  if (config.scheduler?.enabled && config.scheduler?.mode === 'standalone') {
    logger.app.info('expresto-server running in scheduler-only standalone mode (no HTTP server)');
    return runtime;
  }

  app.listen(config.port, config.host || '0.0.0.0', () => {
    logger.app.info(
      `expresto-server listening at http://${config.host || '0.0.0.0'}:${config.port}`
    );
    if (cluster.isWorker && config.cluster?.enabled) {
      process.send?.({
        type: CLUSTER_WORKER_READY_MESSAGE,
        pid: process.pid,
      });
    }
  });

  return runtime;
}

export async function startConfiguredRuntime(
  createRuntime: (configPath: string) => Promise<CliRuntime>,
  configPath: string
): Promise<RuntimeBootstrapResult> {
  const config = await loadConfig(configPath);
  validateClusterRuntimeConfig(config);

  if (config.cluster?.enabled === true && cluster.isPrimary) {
    const logger = setupLogger(config);
    const manager = new ClusterPrimaryManager(config, logger);
    return manager.start();
  }

  return startSingleProcessRuntime(createRuntime, configPath);
}
