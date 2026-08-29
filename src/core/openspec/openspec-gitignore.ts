import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

export const OPENSPEC_GITIGNORE_HEADER =
  '# CodeConductor OpenSpec (local operational artifacts)';

export const OPENSPEC_GITIGNORE_ENTRIES = [
  'BACKLOG.md',
  'openspec/',
  '.codeconductor/openspec-state.json',
] as const;

function gitignoreHasEntry(content: string, entry: string): boolean {
  return content.split(/\r?\n/).some((line) => line.trim() === entry);
}

/**
 * Append OpenSpec local-artifact patterns to a consumer project's `.gitignore`.
 * Does not rewrite existing rules. Returns `.gitignore` when the file changed.
 */
export async function ensureOpenspecGitignore(projectRoot: string): Promise<string | null> {
  if (projectRoot === homedir()) return null;

  const gitignorePath = resolve(projectRoot, '.gitignore');
  let existing = '';
  try {
    existing = await readFile(gitignorePath, 'utf-8');
  } catch {
    existing = '';
  }

  const missing = OPENSPEC_GITIGNORE_ENTRIES.filter((entry) => !gitignoreHasEntry(existing, entry));
  if (missing.length === 0) return null;

  const chunks: string[] = [];
  if (existing.length > 0 && !existing.endsWith('\n')) {
    chunks.push('\n');
  }
  if (!existing.includes(OPENSPEC_GITIGNORE_HEADER)) {
    if (existing.length > 0) chunks.push('\n');
    chunks.push(OPENSPEC_GITIGNORE_HEADER, '\n');
  }
  chunks.push(missing.join('\n'), '\n');

  await writeFile(gitignorePath, existing + chunks.join(''), 'utf-8');
  return '.gitignore';
}
