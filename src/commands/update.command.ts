import { homedir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { loadConfig } from '../core/config/config-loader';
import type { OutputMode } from '../utils/logger';
import {
  checkUpdates,
  validateAgentFileSizes,
  isTargetInstalled,
  loadSkillsLock
} from '../core/presets/update-checker';
import { copyFromManifest } from '../core/presets/file-copier';
import { loadManifest, loadModelConfig, PRESETS_DIR } from '../core/presets/manifest-loader';
import { SRC_PRESETS_DIR, POLICY_PATH } from '../core/presets/package-paths';

export interface UpdateOptions {
  readonly dryRun: boolean;
  readonly force: boolean;
  readonly global: boolean;
  readonly output: OutputMode;
  readonly projectRoot: string;
}

/**
 * Update installed presets
 */
export async function updateCommand(
  options: UpdateOptions
): Promise<{ code: number; data?: unknown }> {
  const { dryRun, force, global: isGlobal, output, projectRoot } = options;
  const basePath = isGlobal ? homedir() : projectRoot;

  try {
    // 1. Load current config
    const configResult = await loadConfig(basePath);
    if (!configResult.success) {
      return {
        code: 1,
        data: {
          success: false,
          command: 'update',
          errors: ['No config found. Run `codeconductor init` first.'],
        },
      };
    }
    const config = configResult.data;

    // 2. Perform updates check
    const updateResults = await checkUpdates(basePath, isGlobal);

    // 3. Print 40KB file size warnings
    const largeFiles = await validateAgentFileSizes(basePath, isGlobal);
    if (largeFiles.length > 0) {
      largeFiles.forEach((file) => {
        console.warn(`[WARNING] File exceeds 40KB: ${file.path} (${(file.size / 1024).toFixed(1)} KB)`);
      });
    }

    // If no updates available, return
    if (!updateResults.hasUpdates) {
      return {
        code: 0,
        data: {
          success: true,
          command: 'update',
          message: 'Already up to date',
          wouldUpdate: [],
          updated: [],
        },
      };
    }

    // Find what we would update
    const wouldUpdate: string[] = [];
    if (updateResults.council) wouldUpdate.push('council preset');
    if (updateResults.policy) wouldUpdate.push('policy file');
    for (const t of updateResults.targets) {
      if (t.hasUpdate) {
        wouldUpdate.push(`${t.target} target files`);
      }
    }
    for (const s of updateResults.skills) {
      if (s.hasUpdate) {
        wouldUpdate.push(`skill ${s.id} to v${s.latestVersion}`);
      }
    }

    // 4. If dryRun, return now
    if (dryRun) {
      return {
        code: 0,
        data: {
          success: true,
          command: 'update',
          message: 'Dry run - would update',
          wouldUpdate,
          updated: [],
        },
      };
    }

    // 5. Apply updates
    const updated: string[] = [];

    // Update council preset
    if (updateResults.council) {
      const localCouncil = resolve(basePath, '.codeconductor', 'presets', 'council.yml');
      const bundledCouncil = resolve(SRC_PRESETS_DIR, 'council', 'council.yml');
      try {
        const content = await readFile(bundledCouncil, 'utf-8');
        await mkdir(dirname(localCouncil), { recursive: true });
        await writeFile(localCouncil, content, 'utf-8');
        updated.push(localCouncil);
      } catch (e) {
        throw new Error(`Failed to update council.yml: ${e}`);
      }
    }

    // Update policy file
    if (updateResults.policy) {
      const localPolicy = resolve(basePath, '.codeconductor', 'presets', 'policy.yml');
      try {
        const content = await readFile(POLICY_PATH, 'utf-8');
        await mkdir(dirname(localPolicy), { recursive: true });
        await writeFile(localPolicy, content, 'utf-8');
        updated.push(localPolicy);
      } catch (e) {
        throw new Error(`Failed to update policy.yml: ${e}`);
      }
    }

    // Update target files
    const locale = config?.defaults?.locale ?? 'en';
    for (const t of updateResults.targets) {
      if (t.hasUpdate) {
        const targetName = t.target as 'opencode' | 'claude' | 'codex' | 'gemini' | 'cursor' | 'agy';
        const manifest = await loadManifest(targetName);
        const modelConfig = await loadModelConfig(targetName);
        const results = await copyFromManifest(
          manifest,
          PRESETS_DIR,
          basePath,
          isGlobal,
          false, // dryRun
          force,
          modelConfig,
          locale
        );
        for (const r of results) {
          if (r.action !== 'skipped' && r.action !== 'error') {
            updated.push(r.dest);
          } else if (r.action === 'error') {
            throw new Error(`Failed to copy target file: ${r.error}`);
          }
        }
      }
    }

    // Update skills lock file
    if (updateResults.skills.some((s) => s.hasUpdate)) {
      // Build new skills lock content
      const newSkillsLock: Record<string, string> = {};
      // Load current lock content first
      const currentLock = await loadSkillsLock(basePath) || {};
      for (const [id, ver] of Object.entries(currentLock)) {
        newSkillsLock[id] = ver;
      }
      for (const s of updateResults.skills) {
        newSkillsLock[s.id] = s.latestVersion;
      }

      // Find where to write: if .codeconductor/presets exists or .agents exists
      let lockDest = resolve(basePath, '.codeconductor', 'skills-lock.json');
      // If .codeconductor doesn't exist but .agents does, write to .agents/skills-lock.json
      try {
        const statAgents = await stat(resolve(basePath, '.agents'));
        if (statAgents.isDirectory()) {
          const statCodeConductor = await stat(resolve(basePath, '.codeconductor')).catch(() => null);
          if (!statCodeConductor) {
            lockDest = resolve(basePath, '.agents', 'skills-lock.json');
          }
        }
      } catch {
        // Ignore
      }

      try {
        await mkdir(dirname(lockDest), { recursive: true });
        await writeFile(lockDest, JSON.stringify(newSkillsLock, null, 2), 'utf-8');
        updated.push(lockDest);
      } catch (e) {
        throw new Error(`Failed to write skills-lock.json: ${e}`);
      }
    }

    return {
      code: 0,
      data: {
        success: true,
        command: 'update',
        message: 'Updated successfully',
        wouldUpdate: [],
        updated,
      },
    };
  } catch (error) {
    return {
      code: 1,
      data: {
        success: false,
        command: 'update',
        errors: [String(error)],
      },
    };
  }
}
