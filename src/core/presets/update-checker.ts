import { stat, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { parse } from 'yaml';
import { loadManifest, loadModelConfig, PRESETS_DIR } from './manifest-loader';
import { renderTemplate, resolveEntryFiles, mergeDeep } from './file-copier';
import { loadConfig } from '../config/config-loader';
import { mergeManagedBlock } from '../filesystem/safe-merger';
import { ROOT_PRESETS_DIR, SRC_PRESETS_DIR, POLICY_PATH } from './package-paths';
import type { InstallStrategy } from '../../validation/schemas';

export interface UpdateCheckResults {
  readonly hasUpdates: boolean;
  readonly council: boolean;
  readonly policy: boolean;
  readonly targets: Array<{ target: string; hasUpdate: boolean; files: string[] }>;
  readonly skills: Array<{ id: string; currentVersion: string; latestVersion: string; hasUpdate: boolean }>;
}

/**
 * Get installation directory path for a given target runner
 */
export function getTargetInstallationPath(
  target: 'opencode' | 'claude' | 'codex' | 'gemini' | 'cursor' | 'agy',
  basePath: string,
  isGlobal: boolean
): string {
  if (target === 'agy') {
    return isGlobal ? resolve(basePath, '.gemini', 'config') : resolve(basePath, '.agents');
  }
  return resolve(basePath, `.${target}`);
}

/**
 * Check if a target is installed (e.g. its target directory exists)
 */
export async function isTargetInstalled(
  target: 'opencode' | 'claude' | 'codex' | 'gemini' | 'cursor' | 'agy',
  basePath: string,
  isGlobal: boolean
): Promise<boolean> {
  const path = getTargetInstallationPath(target, basePath, isGlobal);
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check if AGENTS.md or CLAUDE.md files exceed 40KB
 */
export async function validateAgentFileSizes(
  basePath: string,
  isGlobal: boolean
): Promise<Array<{ path: string; size: number }>> {
  const filesToCheck: string[] = [];

  // Claude: .claude/CLAUDE.md
  filesToCheck.push(resolve(basePath, '.claude', 'CLAUDE.md'));

  // Codex: .codex/AGENTS.md
  filesToCheck.push(resolve(basePath, '.codex', 'AGENTS.md'));

  // Agy:
  if (isGlobal) {
    filesToCheck.push(resolve(basePath, '.gemini', 'config', 'AGENTS.md'));
  } else {
    filesToCheck.push(resolve(basePath, '.agents', 'AGENTS.md'));
  }

  const largeFiles: Array<{ path: string; size: number }> = [];
  for (const filePath of filesToCheck) {
    try {
      const s = await stat(filePath);
      if (s.isFile() && s.size > 40 * 1024) {
        largeFiles.push({ path: filePath, size: s.size });
      }
    } catch {
      // File doesn't exist, ignore
    }
  }

  return largeFiles;
}

/**
 * Helper to check if two files differ in content
 */
async function fileContentDiffers(pathA: string, pathB: string): Promise<boolean> {
  try {
    const contentA = await readFile(pathA, 'utf-8');
    const contentB = await readFile(pathB, 'utf-8');
    return contentA.trim() !== contentB.trim();
  } catch {
    // If one of the files doesn't exist, we assume they differ only if the source (pathB) exists and target doesn't
    try {
      await stat(pathB);
      // pathB exists, but we failed to read pathA, so target doesn't exist or is not readable
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Helper to load skills-lock.json if present
 */
export async function loadSkillsLock(basePath: string): Promise<Record<string, string> | null> {
  const paths = [
    resolve(basePath, '.codeconductor', 'skills-lock.json'),
    resolve(basePath, '.agents', 'skills-lock.json'),
  ];
  for (const p of paths) {
    try {
      const content = await readFile(p, 'utf-8');
      return JSON.parse(content) as Record<string, string>;
    } catch {
      // Ignore
    }
  }
  return null;
}

/**
 * Helper to read a bundled skill's version from frontmatter
 */
async function getLatestSkillVersion(skillId: string): Promise<string | null> {
  const targets: Array<'opencode' | 'claude' | 'codex' | 'gemini' | 'cursor' | 'agy'> = [
    'opencode',
    'agy',
    'claude',
    'codex',
    'gemini',
    'cursor',
  ];
  for (const target of targets) {
    const skillPath = resolve(ROOT_PRESETS_DIR, target, 'skills', skillId, 'SKILL.md');
    try {
      const content = await readFile(skillPath, 'utf-8');
      const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (fmMatch) {
        const parsed = parse(fmMatch[1]);
        if (parsed && parsed.id === skillId && parsed.version) {
          return String(parsed.version);
        }
      }
    } catch {
      // try next
    }
  }
  return null;
}

/**
 * Check for updates for council presets, targets and skills
 */
export async function checkUpdates(
  basePath: string,
  isGlobal: boolean
): Promise<UpdateCheckResults> {
  // 1. Check council preset and policy
  const localCouncil = resolve(basePath, '.codeconductor', 'presets', 'council.yml');
  const bundledCouncil = resolve(SRC_PRESETS_DIR, 'council', 'council.yml');
  const councilHasUpdate = await fileContentDiffers(localCouncil, bundledCouncil);

  const localPolicy = resolve(basePath, '.codeconductor', 'presets', 'policy.yml');
  const policyHasUpdate = await fileContentDiffers(localPolicy, POLICY_PATH);

  // 2. Check installed targets
  const targetsToCheck: Array<'opencode' | 'claude' | 'codex' | 'gemini' | 'cursor' | 'agy'> = [
    'opencode',
    'claude',
    'codex',
    'gemini',
    'cursor',
    'agy',
  ];

  const targetResults: Array<{ target: string; hasUpdate: boolean; files: string[] }> = [];

  // Load config if available for locale
  let locale = 'en';
  try {
    const configResult = await loadConfig(basePath);
    if (configResult.success) {
      locale = configResult.data.defaults.locale ?? 'en';
    }
  } catch {
    // Ignore config load error
  }

  for (const target of targetsToCheck) {
    const isInstalled = await isTargetInstalled(target, basePath, isGlobal);
    if (!isInstalled) {
      continue;
    }

    let manifest;
    let modelConfig;
    try {
      manifest = await loadManifest(target);
      modelConfig = await loadModelConfig(target);
    } catch {
      continue; // Manifest/model config failed to load, ignore target
    }

    const changedFiles: string[] = [];
    for (const entry of manifest.entries) {
      const strategy: InstallStrategy = isGlobal && entry.globalStrategy ? entry.globalStrategy : entry.strategy;
      if (strategy === 'skip') continue;

      let resolvedEntry = entry;
      let targetBaseDir = basePath;
      if (target === 'agy' && isGlobal) {
        targetBaseDir = join(homedir(), '.gemini', 'config');
        resolvedEntry = {
          ...entry,
          dest: entry.dest.replace(/^\.agents\/?/, ''),
        };
      }

      const files = await resolveEntryFiles(resolvedEntry, PRESETS_DIR, targetBaseDir);
      const isTemplate = entry.template === true;

      for (const { src, dest } of files) {
        let expectedContent: string;
        try {
          const srcContent = await readFile(src, 'utf-8');
          expectedContent = isTemplate && modelConfig ? renderTemplate(srcContent, modelConfig, src, locale) : srcContent;
        } catch {
          continue;
        }

        let destContent: string;
        try {
          destContent = await readFile(dest, 'utf-8');
        } catch {
          // Destination file doesn't exist, needs update
          changedFiles.push(dest);
          continue;
        }

        let fileHasUpdate = false;
        if (strategy === 'overwrite') {
          if (destContent.trim() !== expectedContent.trim()) {
            fileHasUpdate = true;
          }
        } else if (strategy === 'append') {
          if (!destContent.includes(expectedContent)) {
            fileHasUpdate = true;
          }
        } else if (strategy === 'merge-json') {
          try {
            const destJson = JSON.parse(destContent);
            const expectedJson = JSON.parse(expectedContent);
            const merged = mergeDeep(destJson, expectedJson);
            if (JSON.stringify(merged) !== JSON.stringify(destJson)) {
              fileHasUpdate = true;
            }
          } catch {
            fileHasUpdate = true;
          }
        } else if (strategy === 'merge-managed') {
          try {
            const merged = mergeManagedBlock(destContent, expectedContent);
            if (merged.content.trim() !== destContent.trim()) {
              fileHasUpdate = true;
            }
          } catch {
            fileHasUpdate = true;
          }
        }

        if (fileHasUpdate) {
          changedFiles.push(dest);
        }
      }
    }

    targetResults.push({
      target,
      hasUpdate: changedFiles.length > 0,
      files: changedFiles,
    });
  }

  // 3. Check skills
  const skillResults: Array<{ id: string; currentVersion: string; latestVersion: string; hasUpdate: boolean }> = [];
  const skillsLock = await loadSkillsLock(basePath);
  if (skillsLock) {
    for (const [skillId, currentVersion] of Object.entries(skillsLock)) {
      const latestVersion = await getLatestSkillVersion(skillId);
      if (latestVersion && latestVersion !== currentVersion) {
        skillResults.push({
          id: skillId,
          currentVersion,
          latestVersion,
          hasUpdate: true,
        });
      } else {
        skillResults.push({
          id: skillId,
          currentVersion,
          latestVersion: latestVersion || currentVersion,
          hasUpdate: false,
        });
      }
    }
  }

  const hasPresetUpdates = councilHasUpdate || policyHasUpdate;
  const hasTargetUpdates = targetResults.some((t) => t.hasUpdate);
  const hasSkillUpdates = skillResults.some((s) => s.hasUpdate);

  return {
    hasUpdates: hasPresetUpdates || hasTargetUpdates || hasSkillUpdates,
    council: councilHasUpdate,
    policy: policyHasUpdate,
    targets: targetResults,
    skills: skillResults,
  };
}
