import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ROOT_PRESETS_DIR, PACKAGE_ROOT } from '../presets/package-paths';

export interface PromptDiffResult {
  fromVersion: string;
  toVersion: string;
  target: string;
  files: Array<{
    path: string;
    changed: boolean;
    addedLines: number;
    removedLines: number;
    hunks: string[];
  }>;
}

function normalizeVersion(v: string): string {
  return v.startsWith('v') ? v : `v${v}`;
}

async function listPromptFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isFile() && e.name.endsWith('.md')).map((e) => e.name);
  } catch {
    return [];
  }
}

function lineDiff(oldText: string, newText: string, path: string): {
  added: number;
  removed: number;
  hunks: string[];
} {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const hunks: string[] = [];
  let added = 0;
  let removed = 0;

  const max = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < max; i++) {
    const o = oldLines[i];
    const n = newLines[i];
    if (o === n) continue;
    if (o === undefined) {
      added++;
      hunks.push(`+ ${n}`);
    } else if (n === undefined) {
      removed++;
      hunks.push(`- ${o}`);
    } else {
      removed++;
      added++;
      hunks.push(`- ${o}`);
      hunks.push(`+ ${n}`);
    }
  }

  if (hunks.length > 0) {
    hunks.unshift(`### ${path}`);
  }
  return { added, removed, hunks };
}

/**
 * Diff prompt contracts between two versions for a target preset.
 */
export async function diffPromptVersions(
  fromVersion: string,
  toVersion: string,
  options: { target?: string; agent?: string; projectRoot?: string } = {}
): Promise<PromptDiffResult> {
  const target = options.target ?? 'opencode';
  const fromV = normalizeVersion(fromVersion);
  const toV = normalizeVersion(toVersion);

  const searchRoots = [
    resolve(options.projectRoot ?? PACKAGE_ROOT, '.agents', 'prompts'),
    join(ROOT_PRESETS_DIR, target, 'prompts'),
    join(ROOT_PRESETS_DIR, 'opencode', 'prompts'),
  ];

  let fromDir = '';
  let toDir = '';
  for (const root of searchRoots) {
    const f = join(root, fromV);
    const t = join(root, toV);
    try {
      await readFile(join(f, 'orchestrator.md'), 'utf-8');
      fromDir = f;
      toDir = t;
      break;
    } catch {
      // try next root
    }
  }

  if (!fromDir) {
    fromDir = join(ROOT_PRESETS_DIR, 'opencode', 'prompts', fromV);
    toDir = join(ROOT_PRESETS_DIR, 'opencode', 'prompts', toV);
  }

  const fromFiles = await listPromptFiles(fromDir);
  const toFiles = await listPromptFiles(toDir);
  const allNames = new Set([...fromFiles, ...toFiles]);
  if (options.agent) {
    const agentFile = `${options.agent}.md`;
    if (allNames.has(agentFile)) {
      allNames.clear();
      allNames.add(agentFile);
    }
  }

  const files: PromptDiffResult['files'] = [];
  for (const name of allNames) {
    let oldText = '';
    let newText = '';
    try {
      oldText = await readFile(join(fromDir, name), 'utf-8');
    } catch {
      oldText = '';
    }
    try {
      newText = await readFile(join(toDir, name), 'utf-8');
    } catch {
      newText = '';
    }
    const { added, removed, hunks } = lineDiff(oldText, newText, name);
    files.push({
      path: name,
      changed: oldText !== newText,
      addedLines: added,
      removedLines: removed,
      hunks,
    });
  }

  return { fromVersion: fromV, toVersion: toV, target, files };
}

export function formatPromptDiffMarkdown(result: PromptDiffResult): string {
  const lines = [
    `# Prompt diff: ${result.fromVersion} → ${result.toVersion}`,
    '',
    `Target: ${result.target}`,
    '',
  ];
  const changed = result.files.filter((f) => f.changed);
  lines.push(`Changed files: ${changed.length} / ${result.files.length}`, '');
  for (const f of changed) {
    lines.push(`## ${f.path} (+${f.addedLines} -${f.removedLines})`, '');
    lines.push(...f.hunks.slice(0, 40));
    if (f.hunks.length > 40) lines.push('... (truncated)');
    lines.push('');
  }
  return lines.join('\n');
}
