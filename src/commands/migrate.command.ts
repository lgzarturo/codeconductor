import { readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { OutputMode } from '../utils/logger';
import { CURRENT_PRESET_VERSION } from '../core/presets/preset-resolver';
import {
  rewriteClaudeHookCommandsForGlobal,
  type HookCommandChange,
} from '../core/presets/hook-command-paths';
import { getTargetInstallationPath, isTargetInstalled } from '../core/presets/update-checker';
import { INDIVIDUAL_TARGETS, type IndividualRunnerTarget } from '../core/runner/runner-target';

export interface MigrateOptions {
  readonly projectRoot: string;
  readonly global: boolean;
  readonly dryRun: boolean;
  readonly output: OutputMode;
  /** Explicit settings.json path, overrides the project/global default. */
  readonly file?: string;
}

const PERMISSION_LISTS = ['allow', 'deny', 'ask'] as const;
const WRITE_RULE = /^Write\((.+)\)$/;

interface RuleChange {
  readonly list: (typeof PERMISSION_LISTS)[number];
  readonly from: string;
  readonly to: string;
}

/**
 * Claude Code only applies file-scoped permission rules written as
 * `Edit(path)` — a `Write(path)` rule silently never matches. Rewrites every
 * `Write(...)` entry in `permissions.{allow,deny,ask}` to the equivalent
 * `Edit(...)` entry, then dedupes: `mergeDeep`'s array-union merge strategy
 * means a broken `Write()` rule and a working `Edit()` rule for the same
 * path can already both be present from repeated installs.
 */
export function migratePermissionRules(settings: Record<string, unknown>): {
  readonly settings: Record<string, unknown>;
  readonly changes: readonly RuleChange[];
  readonly duplicatesRemoved: readonly string[];
} {
  const permissions = settings.permissions;
  if (typeof permissions !== 'object' || permissions === null) {
    return { settings, changes: [], duplicatesRemoved: [] };
  }

  const changes: RuleChange[] = [];
  const duplicatesRemoved: string[] = [];
  const nextPermissions: Record<string, unknown> = { ...(permissions as Record<string, unknown>) };

  for (const list of PERMISSION_LISTS) {
    const rules = nextPermissions[list];
    if (!Array.isArray(rules)) continue;

    const rewritten = rules.map((rule) => {
      if (typeof rule !== 'string') return rule;
      const match = rule.match(WRITE_RULE);
      if (!match) return rule;
      const to = `Edit(${match[1]})`;
      changes.push({ list, from: rule, to });
      return to;
    });

    const seen = new Set<string>();
    const deduped: unknown[] = [];
    for (const rule of rewritten) {
      const key = typeof rule === 'string' ? rule : JSON.stringify(rule);
      if (seen.has(key)) {
        if (typeof rule === 'string') duplicatesRemoved.push(rule);
        continue;
      }
      seen.add(key);
      deduped.push(rule);
    }

    nextPermissions[list] = deduped;
  }

  return {
    settings: { ...settings, permissions: nextPermissions },
    changes,
    duplicatesRemoved,
  };
}

function resolveSettingsPath(options: MigrateOptions): string {
  if (options.file) return resolve(options.projectRoot, options.file);
  const base = options.global ? homedir() : options.projectRoot;
  return join(base, '.claude', 'settings.json');
}

const VERSION_DIR_NAME = /^v\d+\.\d+\.\d+$/;

export interface OrphanedPromptDir {
  readonly target: IndividualRunnerTarget;
  readonly path: string;
  readonly version: string;
}

/**
 * A project's installed `prompts/` directory only ever gains files —
 * `copyFromManifest` writes the current version's files but never removes an
 * older version's directory a previous install created. Scans every
 * installed target's `prompts/` directory for version subdirectories other
 * than `CURRENT_PRESET_VERSION` and reports them as orphaned. `agy` and `pi`
 * share `.agents/prompts/`, so it's only scanned once (`seenDirs`).
 */
export async function findOrphanedPromptVersions(
  basePath: string,
  isGlobal: boolean
): Promise<OrphanedPromptDir[]> {
  const found: OrphanedPromptDir[] = [];
  const seenDirs = new Set<string>();

  for (const target of INDIVIDUAL_TARGETS) {
    const installed = await isTargetInstalled(target, basePath, isGlobal);
    if (!installed) continue;

    const installPath = getTargetInstallationPath(target, basePath, isGlobal);
    const promptsDir = join(installPath, 'prompts');
    if (seenDirs.has(promptsDir)) continue;
    seenDirs.add(promptsDir);

    let entries;
    try {
      entries = await readdir(promptsDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || !VERSION_DIR_NAME.test(entry.name)) continue;
      if (entry.name === CURRENT_PRESET_VERSION) continue;
      found.push({ target, path: join(promptsDir, entry.name), version: entry.name });
    }
  }

  return found;
}

/**
 * `cc migrate` — repairs leftover artifacts a plain reinstall can't fix alone:
 *
 * 1. A Claude Code settings.json left over from before A6/the `Write()` ->
 *    `Edit()` fix (install-time merges can't remove a bad rule already on
 *    disk — `mergeDeep`'s array-union merge only adds).
 * 2. Orphaned `.{target}/prompts/v{old}/` directories from before a
 *    project's manifest pointed at the current prompts version
 *    (`copyFromManifest` only adds/overwrites the current version's files,
 *    it never removes an older version's directory).
 * 3. With `--global`, relative Claude hook commands
 *    (`node .claude/hooks/invoke-hook.cjs …`) rewritten to absolute paths under
 *    the install home so the guard runs from any cwd.
 *
 * A missing settings.json is not an error — many projects (Gemini/Cursor-only
 * ones, for instance) never had one. Only invalid JSON in an existing file is.
 * Doctor detects broken global hook paths but has no `--fix` mode; use migrate.
 */
export async function migrateCommand(
  options: MigrateOptions
): Promise<{ code: number; data?: unknown }> {
  const settingsPath = resolveSettingsPath(options);

  let raw: string | null = null;
  try {
    raw = await readFile(settingsPath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      return {
        code: 1,
        data: {
          success: false,
          command: 'migrate',
          errors: [`Could not read ${settingsPath}: ${String(error)}`],
        },
      };
    }
    // ENOENT: no settings.json in this project — nothing to repair there, not an error.
  }

  let rewritten: readonly RuleChange[] = [];
  let duplicatesRemoved: readonly string[] = [];
  let hookPathRewrites: readonly HookCommandChange[] = [];
  let settingsChanged = false;

  if (raw !== null) {
    let settings: Record<string, unknown>;
    try {
      settings = JSON.parse(raw);
    } catch (error) {
      return {
        code: 1,
        data: {
          success: false,
          command: 'migrate',
          errors: [`${settingsPath} is not valid JSON: ${String(error)}`],
        },
      };
    }

    const migration = migratePermissionRules(settings);
    rewritten = migration.changes;
    duplicatesRemoved = migration.duplicatesRemoved;
    let nextSettings = migration.settings;

    // Global settings left over from before absolute hook-path installs still
    // carry `node .claude/hooks/...`. Rewrite them in place; doctor detects
    // the same issue but has no --fix mode.
    if (options.global) {
      // settings.json lives at <base>/.claude/settings.json — base is home, or
      // the parent of `.claude` when `--file` points at a non-default path.
      const hookBaseDir = options.file
        ? resolve(dirname(settingsPath), '..')
        : homedir();
      const hookRewrite = rewriteClaudeHookCommandsForGlobal(nextSettings, hookBaseDir);
      hookPathRewrites = hookRewrite.changes;
      nextSettings = hookRewrite.settings;
    }

    settingsChanged =
      migration.changes.length > 0
      || migration.duplicatesRemoved.length > 0
      || hookPathRewrites.length > 0;

    if (settingsChanged && !options.dryRun) {
      await writeFile(settingsPath, `${JSON.stringify(nextSettings, null, 2)}\n`, 'utf-8');
    }
  }

  const basePath = options.global ? homedir() : options.projectRoot;
  const orphanedPromptVersions = await findOrphanedPromptVersions(basePath, options.global);
  let orphanedPromptVersionsRemoved = false;
  if (orphanedPromptVersions.length > 0 && !options.dryRun) {
    for (const dir of orphanedPromptVersions) {
      await rm(dir.path, { recursive: true, force: true });
    }
    orphanedPromptVersionsRemoved = true;
  }

  const changed = (settingsChanged && !options.dryRun) || orphanedPromptVersionsRemoved;

  let message: string | undefined;
  if (!settingsChanged && orphanedPromptVersions.length === 0) {
    message =
      raw === null
        ? 'No settings.json found and no orphaned prompt version directories found — nothing to migrate.'
        : 'No Write(path) permission rules, no relative global hook paths, and no orphaned prompt version directories found — nothing to migrate.';
  }

  return {
    code: 0,
    data: {
      success: true,
      command: 'migrate',
      file: settingsPath,
      settingsFileFound: raw !== null,
      changed,
      dryRun: options.dryRun,
      rewritten: rewritten.map((c) => ({ list: c.list, from: c.from, to: c.to })),
      duplicatesRemoved,
      hookPathRewrites: hookPathRewrites.map((c) => ({ from: c.from, to: c.to })),
      orphanedPromptVersions: orphanedPromptVersions.map((d) => ({
        target: d.target,
        path: d.path,
        version: d.version,
      })),
      orphanedPromptVersionsRemoved,
      ...(message ? { message } : {}),
    },
  };
}
