import type { AppConfig } from './config';
import type { AppLogger } from './logger';

type StartableApp = {
  listen: (port: number, host: string, callback?: () => void) => unknown;
};

type CliRuntime = {
  app: StartableApp;
  config: AppConfig;
  logger: AppLogger;
};

export async function startConfiguredRuntime(
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
    logger.app.info(`expresto-server listening at http://${config.host || '0.0.0.0'}:${config.port}`);
  });

  return runtime;
}
