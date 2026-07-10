import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse, stringify } from 'yaml';
import { MemoryIndexSchema, MemoryPointerSchema } from '../../validation/schemas';
import { err, ok, type Result } from '../../utils/result';
import type { MemoryIndex, MemoryPointer } from './memory-types';

const MEMORY_DIR = '.codeconductor';
const MEMORY_FILE = '.codeconductor/memory.md';
const MAX_SIZE_BYTES = 40960; // 40 KiB (40 × 1024 bytes)
const SENTINEL_START = '<!-- memory-index-start -->';
const SENTINEL_END = '<!-- memory-index-end -->';

/**
 * Render a MemoryIndex into the full Markdown file content.
 */
function renderMarkdown(index: MemoryIndex): string {
  const yamlBlock = stringify({ version: index.version, pointers: index.pointers });
  const now = new Date().toISOString();
  const count = index.pointers.length;

  return `# Memory Index

This file is the persistent pointer index for CodeConductor's 3-layer memory architecture.
Pointers are lightweight references to observations stored in Engram, enabling fast topic-based lookup
without loading full session history.

> **Do not edit the YAML block below manually.** Use the \`memory-index\` API to manipulate pointers.

${SENTINEL_START}
\`\`\`yaml
${yamlBlock}\`\`\`
${SENTINEL_END}

---

_Last updated: ${now} · Total pointers: ${count}_
`;
}

/**
 * Extract and parse the sentinel-delimited YAML block from a memory.md file.
 * Returns null if the file does not contain valid sentinels or YAML.
 */
function parseMarkdown(content: string): MemoryIndex | null {
  const startIdx = content.indexOf(SENTINEL_START);
  const endIdx = content.indexOf(SENTINEL_END);
  if (startIdx === -1 || endIdx === -1) return null;

  const block = content.slice(startIdx + SENTINEL_START.length, endIdx);
  // Extract YAML between ``` fences
  const yamlMatch = block.match(/```yaml\n([\s\S]*?)```/);
  if (!yamlMatch) return null;

  try {
    const data = parse(yamlMatch[1]);
    return MemoryIndexSchema.parse(data);
  } catch {
    return null;
  }
}

/**
 * Truncate an index to stay under MAX_SIZE_BYTES by removing oldest pointers.
 * Measures the full rendered Markdown file, not just the YAML block.
 * Returns the truncated index and the count of removed pointers.
 */
function truncateToSize(index: MemoryIndex): { index: MemoryIndex; removed: number; original: number } {
  const original = index.pointers.length;
  let current = { ...index, pointers: [...index.pointers] };

  // Measure the full rendered file to account for Markdown wrapper overhead
  let markdown = renderMarkdown(current);
  if (Buffer.byteLength(markdown, 'utf-8') <= MAX_SIZE_BYTES) {
    return { index: current, removed: 0, original };
  }

  // Sort by timestamp ascending (oldest first) and remove oldest until under limit
  const sorted = [...current.pointers].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  let removed = 0;
  for (let i = 0; i < sorted.length; i++) {
    const remaining = sorted.slice(i + 1);
    const candidate = { ...current, pointers: remaining };
    markdown = renderMarkdown(candidate);
    if (Buffer.byteLength(markdown, 'utf-8') <= MAX_SIZE_BYTES) {
      removed = i + 1;
      current = candidate;
      break;
    }
  }

  return { index: current, removed, original };
}

/**
 * Load and validate a memory index from .codeconductor/memory.md
 */
export async function loadMemoryIndex(projectRoot: string): Promise<Result<MemoryIndex, Error>> {
  try {
    const filePath = resolve(projectRoot, MEMORY_FILE);
    const content = await readFile(filePath, 'utf-8');
    const parsed = parseMarkdown(content);
    if (!parsed) {
      return err(new Error('Failed to parse memory index from memory.md'));
    }
    return ok(parsed);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

/**
 * Write a memory index to .codeconductor/memory.md with truncation.
 * Regenerates the entire Markdown file from the index.
 */
export async function saveMemoryIndex(
  projectRoot: string,
  index: MemoryIndex
): Promise<Result<void, Error>> {
  try {
    // Validate before saving
    MemoryIndexSchema.parse(index);

    const { index: truncated, removed, original } = truncateToSize(index);

    if (removed > 0) {
      console.warn(
        `Memory index truncated: removed ${removed} oldest pointers to stay under 40KB.`
      );
    }

    const dir = resolve(projectRoot, MEMORY_DIR);
    await mkdir(dir, { recursive: true });

    let markdown = renderMarkdown(truncated);
    if (removed > 0) {
      // Update footer to reflect truncation
      markdown = markdown.replace(
        /_Last updated:.*?_/,
        `_Last updated: ${new Date().toISOString()} · Total pointers: ${truncated.pointers.length} (truncated from ${original})_`
      );
    }

    const filePath = resolve(projectRoot, MEMORY_FILE);
    await writeFile(filePath, markdown, 'utf-8');
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

/**
 * Add a pointer to the index (immutable — returns new index).
 */
export function addPointer(index: MemoryIndex, pointer: MemoryPointer): MemoryIndex {
  MemoryPointerSchema.parse(pointer);
  return {
    version: 1,
    pointers: [...index.pointers, pointer],
  };
}

/**
 * Update an existing pointer by topic_key (immutable — returns new index).
 * Only the provided fields are updated; topic_key is immutable.
 */
export function updatePointer(
  index: MemoryIndex,
  topic_key: string,
  updates: Partial<Omit<MemoryPointer, 'topic_key'>>
): MemoryIndex {
  return {
    version: 1,
    pointers: index.pointers.map((p) => {
      if (p.topic_key !== topic_key) return p;
      const merged = { ...p, ...updates };
      MemoryPointerSchema.parse(merged);
      return merged;
    }),
  };
}

/**
 * Delete a pointer by topic_key (immutable — returns new index).
 * If the topic_key does not exist, returns the index unchanged.
 */
export function deletePointer(index: MemoryIndex, topic_key: string): MemoryIndex {
  return {
    version: 1,
    pointers: index.pointers.filter((p) => p.topic_key !== topic_key),
  };
}

/**
 * Find all pointers matching a topic_key (exact match).
 */
export function findByTopicKey(index: MemoryIndex, topic_key: string): MemoryPointer[] {
  return index.pointers.filter((p) => p.topic_key === topic_key);
}
