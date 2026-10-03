import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const REQUIREMENT_HEADING = /^### Requirement:.*?\b(FR-\d{3})\b.*$/m;

export interface RequirementBlock {
  /** FR id from the heading, or null when the block carries none. */
  readonly id: string | null;
  readonly markdown: string;
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
 * Split spec markdown into `### Requirement:` blocks with their FR id.
 * This is the only splitter — quality, analyzer and sync all read through it
 * so they can never disagree about where a requirement starts or what its id is.
 */
export function requirementBlocks(markdown: string): RequirementBlock[] {
  const starts = [...markdown.matchAll(/^### Requirement:.*$/gm)];
  return starts.map((match, index) => {
    const start = match.index ?? 0;
    const end = starts[index + 1]?.index ?? markdown.length;
    const block = markdown.slice(start, end).trim();
    return { id: block.match(REQUIREMENT_HEADING)?.[1] ?? null, markdown: block };
  });
}
