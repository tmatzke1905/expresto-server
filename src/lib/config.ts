import fs from 'node:fs/promises';
import path from 'node:path';
import type { ValidateFunction } from 'ajv';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import middlewareConfigSchema from '../../middleware.config.schema.json';

let validate: ValidateFunction | null = null;

async function getValidator(): Promise<ValidateFunction> {
  if (validate) return validate;

  const ajv = new Ajv2020({ allErrors: true });
  addFormats(ajv);

  validate = ajv.compile(middlewareConfigSchema);
  return validate;
}

export interface AuthConfig {
  jwt?: {
    enabled?: boolean;
    secret?: string;
    algorithm?: string;
    expiresIn?: string;
  };
  basic?: {
    enabled?: boolean;
    users?: Record<string, string> | Array<{ username: string; password: string }>;
  };
}

export interface SchedulerJobConfig {
  enabled: boolean;
  cron: string;
  module: string;
  timezone?: string;
  leaderOnly?: boolean;
  options?: Record<string, unknown>;
}

export interface SchedulerConfig {
  enabled: boolean;
  mode?: 'attached' | 'standalone';
  timezone?: string;
  jobs: Record<string, SchedulerJobConfig>;
}

export interface WebsocketConfig {
  /**
   * Enables WebSocket support on the same HTTP server.
   */
  enabled?: boolean;

  /**
   * Socket.IO path. Defaults to `/socket.io`.
   */
  path?: string;

  /**
   * Optional CORS configuration for WebSockets.
   */
  cors?: {
    origin?: string | string[];
    methods?: string[];
  };
}

export interface AppConfig {
  port: number;
  host?: string;
  contextRoot: string;
  controllersPath: string;
  log: {
    access: string;
    application: string;
    level: string;
    traceRequests?: boolean;
  };
  cors?: { enabled?: boolean; options?: Record<string, unknown> };
  helmet?: { enabled?: boolean; options?: Record<string, unknown> };
  rateLimit?: {
    enabled?: boolean;
    options: Record<string, unknown>;
  };
  websocket?: WebsocketConfig;
  auth?: AuthConfig;
  cluster?: { enabled?: boolean };
  metrics?: { endpoint?: string };
  telemetry?: {
    /** enable/disable OpenTelemetry HTTP span creation (default: false) */
    enabled?: boolean;
    /** logical service name (only used as span attribute; SDK init bleibt beim Host) */
    serviceName?: string;
  };
  scheduler?: SchedulerConfig;
}

/**
 * Loads and validates middleware configuration from JSON file.
 */
export async function loadConfig(configPath: string): Promise<AppConfig> {
  const file = await fs.readFile(path.resolve(configPath), 'utf-8');
  const config = JSON.parse(file);

  const validate = await getValidator();
  if (!validate(config)) {
    const errors = validate.errors?.map(err => `${err.instancePath} ${err.message}`).join('; ');
    throw new Error(`Configuration validation failed: ${errors}`);
  }

  // ✅ safe cast after schema validation
  return config as AppConfig;
}

let config: AppConfig | undefined = undefined;

/**
 * Initializes and validates the configuration once at startup.
 */
export async function initConfig(configPath: string): Promise<void> {
  config = await loadConfig(configPath);
}

/**
 * Returns the validated configuration after initialization.
 * Throws if not yet initialized.
 */
export function getConfig(): AppConfig {
  if (!config) {
    throw new Error('Configuration not initialized. Call initConfig() first.');
  }
  return config;
}
