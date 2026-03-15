#!/usr/bin/env node
import { loadConfig } from './lib/config';

async function validateConfig(configPath = './middleware.config.json') {
  try {
    await loadConfig(configPath);
    process.stdout.write(`Configuration at '${configPath}' is valid.\n`);
    process.exit(0);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Configuration validation failed:\n${message}`);
    process.exit(1);
  }
}

validateConfig(process.argv[2]);
