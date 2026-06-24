import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { ZipArchive } from 'archiver';
import { NodeSSH } from 'node-ssh';
import { execSync } from 'child_process';
import type { DeployConfig, DeployOptions, DeployResult } from './types';

const DEFAULT_FILES = ['.next', 'public', 'package.json', 'package-lock.json', 'next.config.mjs'];

function generateReleaseName(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function defaultLogger(emoji: string, message: string): void {
  const timestamp = new Date().toISOString().substring(11, 19);
  console.log(`[${timestamp}] ${emoji} ${message}`);
}

async function execSSH(
  ssh: NodeSSH,
  command: string,
  options: { ignoreError?: boolean; cwd?: string } = {}
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  const envSetup = 'source ~/.nvm/nvm.sh 2>/dev/null || source ~/.bashrc 2>/dev/null || true';
  const fullCommand = `${envSetup} && ${command}`;
  const result = await ssh.execCommand(fullCommand, { cwd: options.cwd });
  if (result.code !== 0 && !options.ignoreError) {
    throw new Error(`Command failed: ${command}\nStderr: ${result.stderr}\nStdout: ${result.stdout}`);
  }
  return result;
}

function hasLockfileChanged(projectRoot: string, stagingDir: string): boolean {
  const sourceLockfile = path.join(projectRoot, 'package-lock.json');
  const stagingLockfile = path.join(stagingDir, 'package-lock.json');
  if (!fs.existsSync(stagingLockfile)) return true;
  const sourceContent = fs.readFileSync(sourceLockfile, 'utf8');
  const stagingContent = fs.readFileSync(stagingLockfile, 'utf8');
  return sourceContent !== stagingContent;
}

async function installProductionDeps(
  config: DeployConfig,
  stagingDir: string,
  log: typeof defaultLogger
): Promise<void> {
  const projectRoot = config.projectRoot || process.cwd();
  const installCommand = config.installCommand || 'npm ci --omit=dev --ignore-scripts';
  const stagingNodeModules = path.join(stagingDir, 'node_modules');
  const hasCache = fs.existsSync(stagingNodeModules);
  const lockfileChanged = hasLockfileChanged(projectRoot, stagingDir);

  if (!fs.existsSync(stagingDir)) {
    fs.mkdirSync(stagingDir, { recursive: true });
  }

  fs.copyFileSync(path.join(projectRoot, 'package.json'), path.join(stagingDir, 'package.json'));
  fs.copyFileSync(path.join(projectRoot, 'package-lock.json'), path.join(stagingDir, 'package-lock.json'));

  if (!hasCache || lockfileChanged) {
    log('📦', hasCache ? 'Dependencies changed, reinstalling...' : 'Installing production dependencies...');
    execSync(installCommand, { stdio: 'inherit', cwd: stagingDir });
    log('✅', 'Production dependencies installed');
  } else {
    log('⚡', 'Reusing cached dependencies (no changes detected)');
  }
}

async function createDeploymentPackage(
  config: DeployConfig,
  releaseName: string,
  stagingDir: string,
  log: typeof defaultLogger
): Promise<string> {
  const projectRoot = config.projectRoot || process.cwd();
  const filesToTransfer = config.filesToTransfer || DEFAULT_FILES;
  const zipPath = path.join(projectRoot, `release-${releaseName}.zip`);

  log('📦', 'Creating deployment package...');

  return new Promise((resolve, reject) => {
    const archive = new ZipArchive({ zlib: { level: 6 } });
    const stream = fs.createWriteStream(zipPath);

    stream.on('close', () => {
      const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(2);
      log('✅', `Package created: ${sizeMB} MB`);
      resolve(zipPath);
    });

    archive.on('error', (err: Error) => reject(err));
    archive.on('warning', (err: { code?: string }) => {
      if (err.code !== 'ENOENT') console.warn('Archive warning:', err);
    });

    archive.pipe(stream);

    for (const item of filesToTransfer) {
      const itemPath = path.join(projectRoot, item);
      if (fs.existsSync(itemPath)) {
        const stat = fs.statSync(itemPath);
        if (stat.isDirectory()) {
          archive.directory(itemPath, item);
        } else {
          archive.file(itemPath, { name: item });
        }
      } else {
        console.warn(`Warning: ${item} not found, skipping`);
      }
    }

    const stagingNodeModules = path.join(stagingDir, 'node_modules');
    if (fs.existsSync(stagingNodeModules)) {
      log('📦', 'Adding production dependencies to package...');
      archive.directory(stagingNodeModules, 'node_modules');
    } else {
      reject(new Error('Staging node_modules not found. Ensure installProductionDeps ran first.'));
      return;
    }

    archive.finalize();
  });
}

async function cleanupOldReleases(
  ssh: NodeSSH,
  config: DeployConfig,
  log: typeof defaultLogger
): Promise<void> {
  const basePath = config.paths.basePath;
  const releasesDir = config.paths.releasesDir || 'releases';
  const releasesToKeep = config.releasesToKeep ?? 5;
  const releasesPath = `${basePath}/${releasesDir}`;

  log('🧹', `Cleaning up old releases (keeping ${releasesToKeep})...`);

  try {
    const result = await execSSH(ssh, `ls -1 ${releasesPath} | sort`);
    const releases = result.stdout.trim().split('\n').filter((r) => r && /^\d{14}$/.test(r));

    if (releases.length <= releasesToKeep) {
      log('✅', `No cleanup needed (${releases.length} releases)`);
      return;
    }

    const toDelete = releases.slice(0, releases.length - releasesToKeep);
    for (const release of toDelete) {
      log('🗑️', `Deleting old release: ${release}`);
      await execSSH(ssh, `rm -rf ${releasesPath}/${release}`, { ignoreError: true });
    }
    log('✅', `Cleaned up ${toDelete.length} old release(s)`);
  } catch (error) {
    log('⚠️', `Cleanup warning: ${(error as Error).message}`);
  }
}

export async function deploy(config: DeployConfig, options: DeployOptions = {}): Promise<DeployResult> {
  const log = config.logger || defaultLogger;
  const projectRoot = config.projectRoot || process.cwd();
  const releasesDir = config.paths.releasesDir || 'releases';
  const currentLink = config.paths.currentLink || 'current';
  const buildCommand = config.buildCommand || 'npm run build';
  const stagingDir = path.join(projectRoot, '.deploy-staging');

  const ssh = new NodeSSH();
  const releaseName = generateReleaseName();
  const releasePath = `${config.paths.basePath}/${releasesDir}/${releaseName}`;
  const currentPath = `${config.paths.basePath}/${currentLink}`;
  let releaseCreated = false;
  let zipPath: string | null = null;

  log('🚀', `Starting deployment: ${releaseName}`);

  if (options.dryRun) {
    log('🏜️', 'Dry run mode — no actions will be executed');
    return { success: true, releaseName };
  }

  if (options.fresh && fs.existsSync(stagingDir)) {
    log('🗑️', 'Clearing dependency cache (--fresh)...');
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }

  try {
    // Build
    if (!options.skipBuild) {
      await config.hooks?.preBuild?.();
      log('🔨', 'Running local build...');
      execSync(buildCommand, { stdio: 'inherit', cwd: projectRoot });
      log('✅', 'Build completed');
      await config.hooks?.postBuild?.();
    } else {
      log('⏭️', 'Skipping build (--skip-build)');
    }

    // Install production deps
    await installProductionDeps(config, stagingDir, log);

    // Create package
    zipPath = await createDeploymentPackage(config, releaseName, stagingDir, log);

    // Upload via SCP
    const remoteTmpZip = `/tmp/release-${releaseName}.zip`;
    log('📤', 'Uploading package to server...');
    const normalizedKeyPath = config.server.privateKeyPath.replace(/\\/g, '/');
    const normalizedZipPath = zipPath.replace(/\\/g, '/');
    const port = config.server.port || 22;
    const scpCommand = `scp -P ${port} -i "${normalizedKeyPath}" -o StrictHostKeyChecking=no "${normalizedZipPath}" ${config.server.username}@${config.server.host}:${remoteTmpZip}`;
    execSync(scpCommand, { stdio: 'inherit' });
    log('✅', 'Package uploaded');

    // Connect SSH
    log('🔌', 'Connecting to server...');
    const privateKeyContent = fs.readFileSync(config.server.privateKeyPath, 'utf8');
    await ssh.connect({
      host: config.server.host,
      port,
      username: config.server.username,
      privateKey: privateKeyContent,
    });
    log('✅', 'Connected');

    // Cleanup local zip
    await fsp.unlink(zipPath);
    zipPath = null;

    // Create release directory
    log('📁', `Creating release: ${releaseName}`);
    await execSSH(ssh, `mkdir -p ${releasePath}`);
    releaseCreated = true;

    // Extract
    log('📦', 'Extracting on server...');
    await execSSH(ssh, `unzip -q -o ${remoteTmpZip} -d ${releasePath}`);
    await execSSH(ssh, `rm -f ${remoteTmpZip}`);

    // Verify .next
    const verifyResult = await execSSH(ssh, `cat ${releasePath}/.next/BUILD_ID`, { ignoreError: true });
    if (verifyResult.code !== 0) {
      throw new Error('.next/BUILD_ID not found after extraction');
    }
    log('✅', `Extracted (BUILD_ID: ${verifyResult.stdout.trim()})`);

    // Verify node_modules
    const nmCheck = await execSSH(ssh, `test -d ${releasePath}/node_modules && echo "exists"`, { ignoreError: true });
    if (nmCheck.stdout.trim() !== 'exists') {
      throw new Error('node_modules not found in release package');
    }

    // Fix binary permissions
    await execSSH(ssh, `chmod +x ${releasePath}/node_modules/.bin/* 2>/dev/null || true`, { ignoreError: true });

    // Link shared .env
    const sharedEnvPath = config.sharedEnvPath || `${config.paths.basePath}/shared/.env`;
    const envCheck = await execSSH(ssh, `test -f ${sharedEnvPath} && echo "exists"`, { ignoreError: true });
    if (envCheck.stdout.trim() === 'exists') {
      await execSSH(ssh, `ln -sf ${sharedEnvPath} ${releasePath}/.env`);
      log('✅', 'Shared .env linked');
    } else {
      log('⚠️', `No shared .env at ${sharedEnvPath}`);
    }

    // Pre-switch hook
    await config.hooks?.preSwitch?.(ssh, releasePath);

    // Switch symlink
    log('🔗', 'Switching symlink...');
    await execSSH(ssh, `ln -sfn ${releasePath} ${currentPath}`);
    log('✅', 'Symlink updated');

    // Post-switch hook
    await config.hooks?.postSwitch?.(ssh, releasePath);

    // Restart PM2
    log('♻️', `Restarting PM2: ${config.pm2Process}`);
    await execSSH(ssh, `pm2 restart ${config.pm2Process}`, { ignoreError: true });
    const pm2Status = await execSSH(ssh, `pm2 show ${config.pm2Process} | grep -E "(status|cwd)"`, { ignoreError: true });
    if (pm2Status.stdout) {
      log('📊', pm2Status.stdout.trim().replace(/\n/g, ' | '));
    }

    // Cleanup old releases
    await cleanupOldReleases(ssh, config, log);

    log('💾', 'Staging cache preserved for next deploy');
    log('🎉', `Deployment successful! Release: ${releaseName}`);

    await config.hooks?.postDeploy?.(releaseName);

    return { success: true, releaseName };
  } catch (error) {
    const message = (error as Error).message;
    log('❌', `Deployment failed: ${message}`);

    if (releaseCreated) {
      log('🧹', 'Cleaning up failed release...');
      try {
        await execSSH(ssh, `rm -rf ${releasePath}`, { ignoreError: true });
      } catch {}
    }

    if (zipPath && fs.existsSync(zipPath)) {
      try { await fsp.unlink(zipPath); } catch {}
    }

    return { success: false, releaseName, error: message };
  } finally {
    ssh.dispose();
  }
}
