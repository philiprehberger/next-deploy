#!/usr/bin/env node

import { deploy } from './deploy';
import { rollback } from './rollback';
import { loadConfig, loadConfigFromEnv } from './config';
import type { DeployConfig } from './types';

function parseKeep(args: string[]): number | undefined {
  const idx = args.findIndex((a) => a === '--keep' || a.startsWith('--keep='));
  if (idx === -1) return undefined;
  const arg = args[idx]!;
  const raw = arg.includes('=') ? arg.split('=')[1]! : args[idx + 1];
  if (!raw) return undefined;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] === 'rollback' ? 'rollback' : 'deploy';

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
  @philiprehberger/next-deploy

  Release-based SSH deployment for Next.js apps.

  Usage:
    next-deploy [options]      Deploy a new release
    next-deploy rollback       Switch current symlink to the previous release

  Options:
    --skip-build    Skip the local build step
    --fresh         Force fresh dependency install (clear cache)
    --dry-run       Log actions without executing
    --keep N        Override releasesToKeep at runtime (positive integer)
    --help, -h      Show this help message

  Configuration:
    Create a deploy.config.js (or .mjs/.ts) in your project root,
    or set environment variables:

    SERVER_HOST          SSH host
    SERVER_USERNAME      SSH username
    SERVER_PRIVATE_KEY   Path to SSH private key
    SERVER_BASE_PATH     Remote base path (e.g., /var/www/myapp)
    SERVER_PM2_PROCESS   PM2 process name
    SERVER_PORT          SSH port (default: 22)
    RELEASES_TO_KEEP     Number of releases to keep (default: 5)

  Server Structure:
    {basePath}/
    ├── releases/
    │   ├── 20251212112502/
    │   └── ...
    ├── current -> releases/{latest}/
    └── shared/
        └── .env
`);
    process.exit(0);
  }

  const skipBuild = args.includes('--skip-build');
  const fresh = args.includes('--fresh');
  const dryRun = args.includes('--dry-run');
  const keep = parseKeep(args);
  const projectRoot = process.cwd();

  let config: DeployConfig;

  // Try loading config file first, fall back to env vars
  const fileConfig = await loadConfig(projectRoot);
  if (fileConfig) {
    config = { ...fileConfig, projectRoot: fileConfig.projectRoot || projectRoot };
  } else {
    try {
      config = loadConfigFromEnv({ projectRoot });
    } catch (err) {
      console.error(`❌ ${(err as Error).message}`);
      console.error('\nRun next-deploy --help for usage information.');
      process.exit(1);
    }
  }

  if (keep !== undefined) {
    config = { ...config, releasesToKeep: keep };
  }

  const result = command === 'rollback'
    ? await rollback(config)
    : await deploy(config, { skipBuild, fresh, dryRun });

  if (!result.success) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
