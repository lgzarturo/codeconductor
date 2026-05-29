import { execFile } from 'node:child_process';
import { access, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { LspDefinition, LspInstallResult, LspInstallReport, LspStatus } from '../../domain/lsp/lsp-definition';

const execFileAsync = promisify(execFile);

/**
 * LSP installer class
 */
export class LspInstaller {
  private readonly lspBinDir: string;

  constructor() {
    this.lspBinDir = join(homedir(), '.codeconductor', 'lsp', 'bin');
  }

  /**
   * Check if an LSP is installed
   */
  async checkInstalled(def: LspDefinition): Promise<LspStatus> {
    try {
      const { stdout } = await execFileAsync('which', [def.binaryName], { timeout: 5000 });
      const path = stdout.trim();
      if (path) {
        const version = await this.getVersion(def);
        return { installed: true, version, path };
      }
    } catch {
      // Not found via which
    }

    // For npm packages, also check npm list -g
    if (def.packageManager === 'npm' && def.npmDetect) {
      try {
        const { stdout } = await execFileAsync('npm', ['list', '-g', def.npmDetect, '--depth=0'], { timeout: 10000 });
        if (stdout.includes(def.npmDetect)) {
          const version = this.parseVersionFromNpmList(stdout, def.npmDetect);
          return { installed: true, version };
        }
      } catch {
        // npm list failed
      }
    }

    // For pip packages, also check pip show
    if (def.packageManager === 'pip' && def.pipDetect) {
      try {
        const { stdout } = await execFileAsync('pip', ['show', def.pipDetect], { timeout: 10000 });
        if (stdout.includes('Version:')) {
          const version = this.parseVersionFromPipShow(stdout);
          return { installed: true, version };
        }
      } catch {
        // pip show failed
      }
    }

    return { installed: false };
  }

  /**
   * Install an LSP
   */
  async installLsp(def: LspDefinition): Promise<LspInstallResult> {
    const status = await this.checkInstalled(def);
    if (status.installed) {
      return {
        lspId: def.id,
        status: 'already-installed',
        version: status.version,
      };
    }

    try {
      switch (def.packageManager) {
        case 'npm':
          await this.installNpm(def);
          break;
        case 'pip':
          await this.installPip(def);
          break;
        case 'binary':
          await this.installBinary(def);
          break;
      }

      const newStatus = await this.checkInstalled(def);
      return {
        lspId: def.id,
        status: 'installed',
        version: newStatus.version,
      };
    } catch (error) {
      return {
        lspId: def.id,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Install multiple LSPs
   */
  async installAll(
    lsps: readonly LspDefinition[],
    options: { dryRun: boolean }
  ): Promise<LspInstallReport> {
    const results: LspInstallResult[] = [];

    for (const lsp of lsps) {
      if (options.dryRun) {
        const status = await this.checkInstalled(lsp);
        results.push({
          lspId: lsp.id,
          status: status.installed ? 'already-installed' : 'installed',
          version: status.version,
        });
      } else {
        const result = await this.installLsp(lsp);
        results.push(result);
      }
    }

    return {
      results,
      allSucceeded: results.every((r) => r.status !== 'failed'),
    };
  }

  private async getVersion(def: LspDefinition): Promise<string | undefined> {
    try {
      const { stdout } = await execFileAsync(def.binaryName, [def.versionFlag], { timeout: 5000 });
      return stdout.trim().split('\n')[0];
    } catch {
      return undefined;
    }
  }

  private parseVersionFromNpmList(output: string, packageName: string): string | undefined {
    const match = output.match(new RegExp(`${packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}@([\\d.]+)`));
    return match?.[1];
  }

  private parseVersionFromPipShow(output: string): string | undefined {
    const match = output.match(/Version:\s*([\d.]+)/);
    return match?.[1];
  }

  private async installNpm(def: LspDefinition): Promise<void> {
    try {
      await execFileAsync('npm', ['install', '-g', def.package], { timeout: 120000 });
    } catch (error) {
      throw new Error(`Failed to install ${def.serverName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async installPip(def: LspDefinition): Promise<void> {
    try {
      await execFileAsync('pip', ['install', '--user', def.package], { timeout: 120000 });
    } catch (error) {
      throw new Error(`Failed to install ${def.serverName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async installBinary(def: LspDefinition): Promise<void> {
    if (!def.binaryPlatforms) {
      throw new Error(`No binary platforms defined for ${def.serverName}`);
    }

    const platformKey = `${process.platform}-${process.arch}`;
    const binary = def.binaryPlatforms[platformKey];

    if (!binary) {
      throw new Error(`No binary available for platform: ${platformKey}`);
    }

    // Ensure bin directory exists
    await mkdir(this.lspBinDir, { recursive: true });

    const destPath = join(this.lspBinDir, def.binaryName);

    // Check if already exists
    try {
      await access(destPath);
      return; // Already installed
    } catch {
      // Not installed, proceed
    }

    // Download and extract
    const { execSync } = await import('node:child_process');
    const isWindows = process.platform === 'win32';
    const extractCmd = binary.url.endsWith('.zip')
      ? `curl -L "${binary.url}" | tar -xz -C "${this.lspBinDir}"`
      : `curl -L "${binary.url}" | tar -xz -C "${this.lspBinDir}"`;

    try {
      execSync(extractCmd, { timeout: 120000, stdio: 'pipe' });

      // Make executable (non-Windows)
      if (!isWindows) {
        execSync(`chmod +x "${destPath}"`, { stdio: 'pipe' });
      }
    } catch (error) {
      throw new Error(`Failed to download ${def.serverName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * Create LSP installer instance
 */
export function createLspInstaller(): LspInstaller {
  return new LspInstaller();
}
