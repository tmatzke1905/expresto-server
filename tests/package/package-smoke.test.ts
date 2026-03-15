import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '../..');
const tmpRoot = path.join(repoRoot, 'tests', 'tmp');

fs.mkdirSync(tmpRoot, { recursive: true });

function run(
  command: string,
  args: string[],
  cwd: string,
  extraEnv: NodeJS.ProcessEnv = {}
): string {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      CI: '1',
      ...extraEnv,
    },
  }).trim();
}

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(tmpRoot, prefix));
}

describe('published package smoke test', () => {
  it(
    'packs a consumable npm artifact for CommonJS and ESM consumers',
    async () => {
      const packageWorkDir = makeTempDir('package-smoke-');

      try {
        const npmCacheDir = path.join(packageWorkDir, 'npm-cache');
        const packDir = path.join(packageWorkDir, 'pack');
        const extractDir = path.join(packageWorkDir, 'extract');
        const consumerDir = path.join(packageWorkDir, 'consumer');
        const consumerPackageDir = path.join(consumerDir, 'node_modules', 'expresto');
        const controllersDir = path.join(consumerDir, 'controllers');
        const logsDir = path.join(consumerDir, 'logs');

        fs.mkdirSync(npmCacheDir, { recursive: true });
        fs.mkdirSync(packDir, { recursive: true });
        fs.mkdirSync(extractDir, { recursive: true });
        fs.mkdirSync(path.join(consumerDir, 'node_modules'), { recursive: true });
        fs.mkdirSync(controllersDir, { recursive: true });
        fs.mkdirSync(logsDir, { recursive: true });

        run('npm', ['run', 'build'], repoRoot, { npm_config_cache: npmCacheDir });

        const dryRunOutput = run(
          'npm',
          ['pack', '--dry-run', '--json'],
          repoRoot,
          { npm_config_cache: npmCacheDir }
        );
        const dryRun = JSON.parse(dryRunOutput) as Array<{
          files: Array<{ path: string }>;
        }>;
        const packedFiles = dryRun[0]?.files.map(file => file.path) ?? [];

        expect(packedFiles).toContain('dist/index.js');
        expect(packedFiles).toContain('dist/index.mjs');
        expect(packedFiles).toContain('dist/index.d.ts');
        expect(packedFiles).toContain('middleware.config.schema.json');
        expect(packedFiles).toContain('README.md');
        expect(packedFiles).toContain('LICENSE');

        const packOutput = run(
          'npm',
          ['pack', '--json', '--pack-destination', packDir],
          repoRoot,
          { npm_config_cache: npmCacheDir }
        );
        const packed = JSON.parse(packOutput) as Array<{ filename: string }>;
        const tarballName = packed[0]?.filename;

        expect(tarballName).toBeTruthy();

        run('tar', ['-xzf', path.join(packDir, tarballName!), '-C', extractDir], repoRoot);

        fs.cpSync(path.join(extractDir, 'package'), consumerPackageDir, { recursive: true });

        fs.writeFileSync(
          path.join(controllersDir, 'ping-controller.js'),
          `module.exports = {
  route: '/ping',
  handlers: [
    {
      method: 'get',
      path: '/',
      secure: false,
      handler: (_req, res) => {
        res.json({ pong: true });
      }
    }
  ]
};
`,
          'utf8'
        );

        fs.writeFileSync(
          path.join(consumerDir, 'middleware.config.prod.json'),
          JSON.stringify(
            {
              port: 3001,
              host: '127.0.0.1',
              contextRoot: '/api',
              controllersPath: controllersDir,
              log: {
                access: path.join(logsDir, 'access.log'),
                application: path.join(logsDir, 'application.log'),
                level: 'fatal',
              },
              cors: { enabled: false, options: {} },
              helmet: { enabled: false, options: {} },
              rateLimit: { enabled: false, options: {} },
              metrics: { endpoint: '/__metrics' },
              telemetry: { enabled: false },
              auth: { jwt: { enabled: false }, basic: { enabled: false } },
            },
            null,
            2
          ),
          'utf8'
        );

        const requireOutput = run(
          'node',
          [
            '-e',
            `console.warn = () => {};
const pkg = require('expresto');
const schemaPath = require.resolve('expresto/middleware.config.schema.json');
(async () => {
  const runtime = await pkg.createServer('./middleware.config.prod.json');
  console.log(JSON.stringify({
    exports: Object.keys(pkg),
    hasCreateServer: typeof pkg.createServer === 'function',
    hasApp: typeof runtime.app?.use === 'function',
    schemaReadable: require('node:fs').existsSync(schemaPath)
  }));
})().catch(err => {
  console.error(err);
  process.exit(1);
});`,
          ],
          consumerDir
        );
        const requireResult = JSON.parse(requireOutput) as {
          exports: string[];
          hasCreateServer: boolean;
          hasApp: boolean;
          schemaReadable: boolean;
        };

        expect(requireResult.exports).toContain('createServer');
        expect(requireResult.hasCreateServer).toBe(true);
        expect(requireResult.hasApp).toBe(true);
        expect(requireResult.schemaReadable).toBe(true);

        const importOutput = run(
          'node',
          [
            '--input-type=module',
            '-e',
            `const pkg = await import('expresto');
console.log(JSON.stringify({
  exports: Object.keys(pkg),
  hasCreateServer: typeof pkg.createServer === 'function'
}));`,
          ],
          consumerDir
        );
        const importResult = JSON.parse(importOutput) as {
          exports: string[];
          hasCreateServer: boolean;
        };

        expect(importResult.exports).toContain('createServer');
        expect(importResult.hasCreateServer).toBe(true);
      } finally {
        fs.rmSync(packageWorkDir, { recursive: true, force: true });
      }
    },
    60_000
  );
});
