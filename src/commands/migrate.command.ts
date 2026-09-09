import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import type { OutputMode } from '../utils/logger';

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

/**
 * `cc migrate` — repairs a Claude Code settings.json left over from before
 * A6/the `Write()` -> `Edit()` fix. Install-time merges can't remove a bad
 * rule that's already on disk (array-union merge), so this is a standalone
 * repair pass, not something a reinstall fixes on its own.
 */
export async function migrateCommand(
  options: MigrateOptions
): Promise<{ code: number; data?: unknown }> {
  const settingsPath = resolveSettingsPath(options);

  let raw: string;
  try {
    raw = await readFile(settingsPath, 'utf-8');
  } catch (error) {
    return {
      code: 1,
      data: {
        success: false,
        command: 'migrate',
        errors: [`Could not read ${settingsPath}: ${String(error)}`],
      },
    };
  }

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

  const { settings: migrated, changes, duplicatesRemoved } = migratePermissionRules(settings);

  if (changes.length === 0 && duplicatesRemoved.length === 0) {
    return {
      code: 0,
      data: {
        success: true,
        command: 'migrate',
        file: settingsPath,
        changed: false,
        message: 'No Write(path) permission rules found — nothing to migrate.',
      },
    };
  }

  if (!options.dryRun) {
    await writeFile(settingsPath, `${JSON.stringify(migrated, null, 2)}\n`, 'utf-8');
  }

  return {
    code: 0,
    data: {
      success: true,
      command: 'migrate',
      file: settingsPath,
      changed: !options.dryRun,
      dryRun: options.dryRun,
      rewritten: changes.map((c) => ({ list: c.list, from: c.from, to: c.to })),
      duplicatesRemoved,
    },
  };
}
