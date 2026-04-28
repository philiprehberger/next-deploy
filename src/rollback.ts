import fs from 'fs';
import { NodeSSH } from 'node-ssh';
import type { DeployConfig, DeployResult } from './types';

function defaultLogger(emoji: string, message: string): void {
  const timestamp = new Date().toISOString().substring(11, 19);
  console.log(`[${timestamp}] ${emoji} ${message}`);
}

async function execSSH(
  ssh: NodeSSH,
  command: string,
  options: { ignoreError?: boolean; cwd?: string } = {},
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  const envSetup = 'source ~/.nvm/nvm.sh 2>/dev/null || source ~/.bashrc 2>/dev/null || true';
  const fullCommand = `${envSetup} && ${command}`;
  const result = await ssh.execCommand(fullCommand, { cwd: options.cwd });
  if (result.code !== 0 && !options.ignoreError) {
    throw new Error(`Command failed: ${command}\nStderr: ${result.stderr}\nStdout: ${result.stdout}`);
  }
  return result;
}

/**
 * Switch the `current` symlink to the previous release and restart PM2.
 * Returns the release name now in use, or an error.
 */
export async function rollback(config: DeployConfig): Promise<DeployResult> {
  const log = config.logger || defaultLogger;
  const releasesDir = config.paths.releasesDir || 'releases';
  const currentLink = config.paths.currentLink || 'current';
  const basePath = config.paths.basePath;
  const releasesPath = `${basePath}/${releasesDir}`;
  const currentPath = `${basePath}/${currentLink}`;
  const ssh = new NodeSSH();

  try {
    log('🔌', 'Connecting to server...');
    const privateKeyContent = fs.readFileSync(config.server.privateKeyPath, 'utf8');
    await ssh.connect({
      host: config.server.host,
      port: config.server.port || 22,
      username: config.server.username,
      privateKey: privateKeyContent,
    });

    const listing = await execSSH(ssh, `ls -1 ${releasesPath} | sort`);
    const releases = listing.stdout.trim().split('\n').filter((r) => r && /^\d{14}$/.test(r));
    if (releases.length < 2) {
      throw new Error(`Need at least 2 releases to roll back (found ${releases.length})`);
    }

    const currentResult = await execSSH(ssh, `readlink ${currentPath}`, { ignoreError: true });
    const currentRelease = currentResult.stdout.trim().split('/').pop() ?? '';
    const currentIdx = releases.indexOf(currentRelease);

    let target: string;
    if (currentIdx > 0) {
      target = releases[currentIdx - 1]!;
    } else {
      target = releases[releases.length - 2]!;
    }

    if (target === currentRelease) {
      throw new Error('No previous release available to roll back to');
    }

    log('⏪', `Rolling back to ${target} (was ${currentRelease || 'unknown'})`);
    await execSSH(ssh, `ln -sfn ${releasesPath}/${target} ${currentPath}`);
    log('✅', 'Symlink switched');

    log('♻️', `Restarting PM2: ${config.pm2Process}`);
    await execSSH(ssh, `pm2 restart ${config.pm2Process}`, { ignoreError: true });

    log('🎉', `Rollback complete. Active release: ${target}`);
    return { success: true, releaseName: target };
  } catch (error) {
    const message = (error as Error).message;
    log('❌', `Rollback failed: ${message}`);
    return { success: false, releaseName: '', error: message };
  } finally {
    ssh.dispose();
  }
}
