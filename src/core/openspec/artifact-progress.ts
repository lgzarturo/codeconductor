import { access, readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export interface ArtifactPresence {
  readonly proposal: boolean;
  readonly design: boolean;
  readonly tasks: boolean;
  readonly specs: boolean;
}

export interface CheckboxProgress {
  readonly total: number;
  readonly complete: number;
  readonly remaining: number;
}

export interface ArtifactProgress {
  readonly artifacts: ArtifactPresence;
  readonly checkboxes: CheckboxProgress;
}

const CHECKBOX = /^\s*-\s*\[([^\]])\]/;

const ABSENT: ArtifactProgress = {
  artifacts: { proposal: false, design: false, tasks: false, specs: false },
  checkboxes: { total: 0, complete: 0, remaining: 0 },
};

/**
 * Count `- [ ]` task boxes. Only `x`/`X` counts as complete; unfamiliar
 * markers stay incomplete (opsx task-tracking rule).
 */
export function countCheckboxes(markdown: string): CheckboxProgress {
  let total = 0;
  let complete = 0;
  for (const line of markdown.split('\n')) {
    const marker = line.match(CHECKBOX)?.[1];
    if (marker === undefined) continue;
    total += 1;
    if (marker === 'x' || marker === 'X') complete += 1;
  }
  return { total, complete, remaining: total - complete };
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function hasMarkdown(dir: string): Promise<boolean> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isFile() && entry.name.endsWith('.md')) return true;
    if (entry.isDirectory() && (await hasMarkdown(full))) return true;
  }
  return false;
}

/**
 * Read-only artifact presence plus tasks.md checkbox progress for a change
 * folder. Never throws for missing files; an escaping path reads as absent.
 */
export async function readArtifactProgress(
  projectRoot: string,
  changePath: string,
): Promise<ArtifactProgress> {
  const root = resolve(projectRoot);
  const changeRoot = resolve(root, changePath);
  if (changeRoot !== root && !changeRoot.startsWith(`${root}/`)) {
    return ABSENT;
  }
  const [proposal, design, tasks, specs] = await Promise.all([
    exists(join(changeRoot, 'proposal.md')),
    exists(join(changeRoot, 'design.md')),
    exists(join(changeRoot, 'tasks.md')),
    hasMarkdown(join(changeRoot, 'specs')),
  ]);
  let checkboxes: CheckboxProgress = { total: 0, complete: 0, remaining: 0 };
  if (tasks) {
    try {
      checkboxes = countCheckboxes(await readFile(join(changeRoot, 'tasks.md'), 'utf-8'));
    } catch {
      checkboxes = { total: 0, complete: 0, remaining: 0 };
    }
  }
  return { artifacts: { proposal, design, tasks, specs }, checkboxes };
}

/** Artifact ids from ArtifactPresence that are missing, in stable order. */
export function missingArtifacts(presence: ArtifactPresence): string[] {
  const missing: string[] = [];
  if (!presence.proposal) missing.push('proposal.md');
  if (!presence.design) missing.push('design.md');
  if (!presence.tasks) missing.push('tasks.md');
  if (!presence.specs) missing.push('specs/*.md');
  return missing;
}
