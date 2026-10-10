import { readFile, readdir } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

const REQUIREMENT_HEADING = /^### Requirement:.*?\b(FR-\d{3})\b.*$/m;

export interface RequirementBlock {
  /** Existing FR id, or a stable capability/name ID. */
  readonly id: string | null;
  readonly markdown: string;
  readonly name?: string;
  readonly deltaOperation?: DeltaOperation;
  readonly renamedFrom?: string;
}

export type DeltaOperation = 'ADDED' | 'MODIFIED' | 'REMOVED' | 'RENAMED';

export function requirementId(name: string, capability: string): string {
  const frId = name.match(/\bFR-\d{3}\b/)?.[0];
  if (frId) return frId;
  return `req:${capability}/${specNameSlug(name)}`;
}

export function specNameSlug(name: string): string {
  return name.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function specCapability(path: string): string {
  return basename(path) === 'spec.md' ? basename(dirname(path)) : basename(path, '.md');
}

export function hasMalformedRenames(markdown: string): boolean {
  const sections = [...markdown.matchAll(/^## (ADDED|MODIFIED|REMOVED|RENAMED) Requirements\s*$/gm)];
  return sections.some((section, index) => {
    if (section[1] !== 'RENAMED') return false;
    const text = markdown.slice((section.index ?? 0) + section[0].length, sections[index + 1]?.index ?? markdown.length)
      .split(/^## /m, 1)[0] ?? '';
    const renamed = requirementBlocks(`## RENAMED Requirements\n${text}`).filter((block) => block.renamedFrom);
    return renamed.length === 0 || renamed.some((block) => block.id?.endsWith('/') || block.renamedFrom?.endsWith('/')) ||
      (text.match(/^- (?:FROM|TO):/gm)?.length ?? 0) !== renamed.length * 2;
  });
}

export interface MarkdownFileContent {
  readonly path: string;
  readonly content: string;
}

/**
 * Recursively list every `.md` file under a directory. Missing directories
 * yield an empty list instead of throwing.
 */
export async function walkMarkdownFiles(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkMarkdownFiles(path)));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(path);
    }
  }
  return files;
}

/**
 * Read every `.md` file under a directory in a single pass.
 */
export async function readMarkdownFiles(dir: string): Promise<MarkdownFileContent[]> {
  const files = await walkMarkdownFiles(dir);
  const out: MarkdownFileContent[] = [];
  for (const path of files) {
    out.push({ path, content: await readFile(path, 'utf-8') });
  }
  return out;
}

/**
 * Split spec markdown into requirement blocks with stable IDs and delta operations.
 * This is the only splitter — quality, analyzer and sync all read through it
 * so they can never disagree about where a requirement starts or what its id is.
 */
export function requirementBlocks(markdown: string, capability?: string): RequirementBlock[] {
  const starts = [...markdown.matchAll(/^### Requirement:.*$/gm)];
  const sections = [...markdown.matchAll(/^## (ADDED|MODIFIED|REMOVED|RENAMED) Requirements\s*$/gm)];
  const headings = [...markdown.matchAll(/^## (.*)$/gm)];
  const blocks: RequirementBlock[] = starts.map((match, index) => {
    const start = match.index ?? 0;
    const heading = [...headings].reverse().find((entry) => (entry.index ?? 0) < start);
    const operation = heading?.[1]?.trim().match(/^(ADDED|MODIFIED|REMOVED|RENAMED) Requirements$/)?.[1];
    const nextSection = markdown.slice(start).search(/^## /m);
    const end = Math.min(starts[index + 1]?.index ?? markdown.length,
      nextSection < 0 ? markdown.length : start + nextSection);
    const block = markdown.slice(start, end).trim();
    const name = match[0].replace(/^### Requirement:\s*/, '').trim();
    return {
      id: block.match(REQUIREMENT_HEADING)?.[1] ?? requirementId(name, capability ?? 'spec'),
      markdown: block,
      name,
      deltaOperation: operation as DeltaOperation | undefined,
    };
  });
  for (const [index, section] of sections.entries()) {
    if (section[1] !== 'RENAMED') continue;
    const text = markdown.slice((section.index ?? 0) + section[0].length, sections[index + 1]?.index ?? markdown.length)
      .split(/^## /m, 1)[0] ?? '';
    const pairs = [...text.matchAll(/^- FROM:\s*`?### Requirement:\s*(.*?)`?\s*\r?\n- TO:\s*`?### Requirement:\s*(.*?)`?\s*$/gm)];
    for (const pair of pairs) {
      const name = pair[2] ?? '';
      blocks.push({ id: requirementId(name, capability ?? 'spec'), markdown: pair[0], name,
        deltaOperation: 'RENAMED', renamedFrom: requirementId(pair[1] ?? '', capability ?? 'spec') });
    }
  }
  return blocks;
}
