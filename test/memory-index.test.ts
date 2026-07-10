/**
 * Tests for the memory index — schema validation, CRUD helpers, round-trip I/O,
 * and 40KB truncation behavior.
 *
 * Covers:
 *   - MemoryPointer / MemoryIndex Zod schema validation
 *   - addPointer / updatePointer / deletePointer / findByTopicKey helpers
 *   - loadMemoryIndex / saveMemoryIndex round-trip
 *   - 40KB truncation (removes oldest pointers)
 *   - Error paths: missing file, malformed YAML, bad sentinels
 */
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  addPointer,
  deletePointer,
  findByTopicKey,
  loadMemoryIndex,
  saveMemoryIndex,
  updatePointer,
} from '../src/core/memory/memory-index';
import {
  MemoryIndexSchema,
  MemoryPointerSchema,
  validateMemoryIndex,
  validateMemoryPointer,
} from '../src/validation/schemas';
import type { MemoryIndex, MemoryPointer } from '../src/core/memory/memory-types';

const PROJECT_ROOT = resolve(import.meta.dir, '..');
const MEMORY_DIR = join(PROJECT_ROOT, '.codeconductor');
const MEMORY_FILE = join(MEMORY_DIR, 'memory.md');

function makePointer(overrides: Partial<MemoryPointer> = {}): MemoryPointer {
  return {
    topic_key: 'architecture/auth-model',
    id: 1,
    file: 'engram/obs-1.md',
    summary: 'JWT auth decision',
    timestamp: '2025-01-15T10:30:00Z',
    tags: ['auth', 'jwt'],
    ...overrides,
  };
}

function makeIndex(pointers: MemoryPointer[] = [makePointer()]): MemoryIndex {
  return { version: 1, pointers };
}

async function cleanup() {
  try {
    // Only remove the memory index file we create; never delete the whole
    // .codeconductor directory because it contains project configuration.
    await rm(MEMORY_FILE, { force: true });
  } catch {}
}

describe('memory-index: schema validation', () => {
  test('MemoryPointerSchema accepts valid pointer', () => {
    const p = makePointer();
    const result = MemoryPointerSchema.safeParse(p);
    expect(result.success).toBe(true);
  });

  test('MemoryPointerSchema rejects empty topic_key', () => {
    const result = MemoryPointerSchema.safeParse({ ...makePointer(), topic_key: '' });
    expect(result.success).toBe(false);
  });

  test('MemoryPointerSchema rejects topic_key > 128 chars', () => {
    const result = MemoryPointerSchema.safeParse({ ...makePointer(), topic_key: 'x'.repeat(129) });
    expect(result.success).toBe(false);
  });

  test('MemoryPointerSchema rejects summary > 200 chars', () => {
    const result = MemoryPointerSchema.safeParse({ ...makePointer(), summary: 'x'.repeat(201) });
    expect(result.success).toBe(false);
  });

  test('MemoryPointerSchema rejects non-positive id', () => {
    const result = MemoryPointerSchema.safeParse({ ...makePointer(), id: 0 });
    expect(result.success).toBe(false);
  });

  test('MemoryPointerSchema rejects invalid datetime', () => {
    const result = MemoryPointerSchema.safeParse({ ...makePointer(), timestamp: 'not-a-date' });
    expect(result.success).toBe(false);
  });

  test('MemoryPointerSchema defaults tags to empty array', () => {
    const { tags, ...rest } = makePointer();
    const result = MemoryPointerSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tags).toEqual([]);
    }
  });

  test('MemoryPointerSchema rejects tags > 10 items', () => {
    const result = MemoryPointerSchema.safeParse({
      ...makePointer(),
      tags: Array.from({ length: 11 }, (_, i) => `tag${i}`),
    });
    expect(result.success).toBe(false);
  });

  test('MemoryIndexSchema accepts valid index', () => {
    const result = MemoryIndexSchema.safeParse(makeIndex());
    expect(result.success).toBe(true);
  });

  test('MemoryIndexSchema rejects non-literal version', () => {
    const result = MemoryIndexSchema.safeParse({ version: 2, pointers: [] });
    expect(result.success).toBe(false);
  });

  test('MemoryIndexSchema rejects version 0', () => {
    const result = MemoryIndexSchema.safeParse({ version: 0, pointers: [] });
    expect(result.success).toBe(false);
  });

  test('MemoryIndexSchema accepts empty pointers array', () => {
    const result = MemoryIndexSchema.safeParse({ version: 1, pointers: [] });
    expect(result.success).toBe(true);
  });

  test('MemoryPointerSchema rejects empty file path', () => {
    const result = MemoryPointerSchema.safeParse({ ...makePointer(), file: '' });
    expect(result.success).toBe(false);
  });

  test('MemoryPointerSchema rejects empty summary', () => {
    const result = MemoryPointerSchema.safeParse({ ...makePointer(), summary: '' });
    expect(result.success).toBe(false);
  });

  test('MemoryPointerSchema rejects non-integer id', () => {
    const result = MemoryPointerSchema.safeParse({ ...makePointer(), id: 1.5 });
    expect(result.success).toBe(false);
  });

  test('MemoryPointerSchema rejects negative id', () => {
    const result = MemoryPointerSchema.safeParse({ ...makePointer(), id: -1 });
    expect(result.success).toBe(false);
  });

  test('MemoryPointerSchema rejects single tag longer than 64 chars', () => {
    const result = MemoryPointerSchema.safeParse({
      ...makePointer(),
      tags: ['x'.repeat(65)],
    });
    expect(result.success).toBe(false);
  });

  test('MemoryPointerSchema accepts topic_key at exactly 128 chars', () => {
    const result = MemoryPointerSchema.safeParse({ ...makePointer(), topic_key: 'x'.repeat(128) });
    expect(result.success).toBe(true);
  });

  test('MemoryPointerSchema accepts summary at exactly 200 chars', () => {
    const result = MemoryPointerSchema.safeParse({ ...makePointer(), summary: 'x'.repeat(200) });
    expect(result.success).toBe(true);
  });

  test('validateMemoryPointer helper returns parsed pointer', () => {
    const p = makePointer();
    const validated = validateMemoryPointer(p);
    expect(validated.topic_key).toBe(p.topic_key);
    expect(validated.id).toBe(p.id);
  });

  test('validateMemoryPointer helper throws on invalid input', () => {
    expect(() => validateMemoryPointer({ ...makePointer(), topic_key: '' })).toThrow();
  });

  test('validateMemoryIndex helper returns parsed index', () => {
    const idx = makeIndex();
    const validated = validateMemoryIndex(idx);
    expect(validated.version).toBe(1);
    expect(validated.pointers).toHaveLength(1);
  });

  test('validateMemoryIndex helper throws on invalid input', () => {
    expect(() => validateMemoryIndex({ version: 2, pointers: [] })).toThrow();
  });
});

describe('memory-index: CRUD helpers', () => {
  test('addPointer appends to pointers array', () => {
    const idx = makeIndex();
    const p2 = makePointer({ topic_key: 'bugfix/n+1', id: 2 });
    const result = addPointer(idx, p2);
    expect(result.pointers).toHaveLength(2);
    expect(result.pointers[1]!.topic_key).toBe('bugfix/n+1');
  });

  test('addPointer is immutable — original unchanged', () => {
    const idx = makeIndex();
    addPointer(idx, makePointer({ id: 99 }));
    expect(idx.pointers).toHaveLength(1);
  });

  test('addPointer rejects invalid pointer', () => {
    const idx = makeIndex();
    expect(() =>
      addPointer(idx, { ...makePointer(), topic_key: '' })
    ).toThrow();
  });

  test('updatePointer modifies matching pointer', () => {
    const idx = makeIndex([
      makePointer({ topic_key: 'a' }),
      makePointer({ topic_key: 'b', id: 2 }),
    ]);
    const result = updatePointer(idx, 'a', { summary: 'updated' });
    expect(result.pointers[0]!.summary).toBe('updated');
    expect(result.pointers[1]!.summary).toBe('JWT auth decision');
  });

  test('updatePointer returns unchanged if topic_key not found', () => {
    const idx = makeIndex();
    const result = updatePointer(idx, 'nonexistent', { summary: 'x' });
    expect(result.pointers).toHaveLength(1);
    expect(result.pointers[0]!.summary).toBe('JWT auth decision');
  });

  test('deletePointer removes matching pointer', () => {
    const idx = makeIndex([
      makePointer({ topic_key: 'a' }),
      makePointer({ topic_key: 'b', id: 2 }),
    ]);
    const result = deletePointer(idx, 'a');
    expect(result.pointers).toHaveLength(1);
    expect(result.pointers[0]!.topic_key).toBe('b');
  });

  test('deletePointer returns unchanged if topic_key not found', () => {
    const idx = makeIndex();
    const result = deletePointer(idx, 'nonexistent');
    expect(result.pointers).toHaveLength(1);
  });

  test('findByTopicKey returns matching pointers', () => {
    const idx = makeIndex([
      makePointer({ topic_key: 'a' }),
      makePointer({ topic_key: 'b', id: 2 }),
      makePointer({ topic_key: 'a', id: 3 }),
    ]);
    const found = findByTopicKey(idx, 'a');
    expect(found).toHaveLength(2);
    expect(found.every((p) => p.topic_key === 'a')).toBe(true);
  });

  test('findByTopicKey returns empty array for no matches', () => {
    const idx = makeIndex();
    expect(findByTopicKey(idx, 'nope')).toHaveLength(0);
  });

  test('addPointer preserves version 1 on returned index', () => {
    const idx = makeIndex();
    const result = addPointer(idx, makePointer({ id: 99 }));
    expect(result.version).toBe(1);
  });

  test('updatePointer is immutable — original unchanged', () => {
    const idx = makeIndex([makePointer({ topic_key: 'a' })]);
    updatePointer(idx, 'a', { summary: 'changed' });
    expect(idx.pointers[0]!.summary).toBe('JWT auth decision');
  });

  test('updatePointer updates all pointers with matching topic_key', () => {
    const idx = makeIndex([
      makePointer({ topic_key: 'dup', id: 1 }),
      makePointer({ topic_key: 'dup', id: 2 }),
      makePointer({ topic_key: 'other', id: 3 }),
    ]);
    const result = updatePointer(idx, 'dup', { summary: 'updated' });
    expect(result.pointers[0]!.summary).toBe('updated');
    expect(result.pointers[1]!.summary).toBe('updated');
    expect(result.pointers[2]!.summary).toBe('JWT auth decision');
  });

  test('updatePointer preserves version 1 on returned index', () => {
    const idx = makeIndex();
    const result = updatePointer(idx, 'architecture/auth-model', { summary: 'x' });
    expect(result.version).toBe(1);
  });

  test('updatePointer rejects invalid updates', () => {
    const idx = makeIndex([makePointer({ topic_key: 'a' })]);
    expect(() => updatePointer(idx, 'a', { summary: '' })).toThrow();
    expect(() => updatePointer(idx, 'a', { id: 0 })).toThrow();
    expect(() => updatePointer(idx, 'a', { file: '' })).toThrow();
  });

  test('deletePointer is immutable — original unchanged', () => {
    const idx = makeIndex([makePointer({ topic_key: 'a' })]);
    deletePointer(idx, 'a');
    expect(idx.pointers).toHaveLength(1);
  });

  test('deletePointer removes all pointers with matching topic_key', () => {
    const idx = makeIndex([
      makePointer({ topic_key: 'dup', id: 1 }),
      makePointer({ topic_key: 'dup', id: 2 }),
      makePointer({ topic_key: 'keep', id: 3 }),
    ]);
    const result = deletePointer(idx, 'dup');
    expect(result.pointers).toHaveLength(1);
    expect(result.pointers[0]!.topic_key).toBe('keep');
  });

  test('findByTopicKey returns empty array for empty index', () => {
    const empty = makeIndex([]);
    expect(findByTopicKey(empty, 'anything')).toEqual([]);
  });

  test('findByTopicKey with empty string returns no matches (no pointer has empty topic_key)', () => {
    const idx = makeIndex([makePointer({ topic_key: 'a' })]);
    expect(findByTopicKey(idx, '')).toEqual([]);
  });
});

describe('memory-index: loadMemoryIndex / saveMemoryIndex', () => {
  beforeEach(async () => {
    await cleanup();
  });

  afterEach(async () => {
    await cleanup();
  });

  test('round-trip preserves all fields', async () => {
    const pointers = [
      makePointer({ topic_key: 'a', id: 1, summary: 'first' }),
      makePointer({ topic_key: 'b', id: 2, summary: 'second', timestamp: '2025-02-01T00:00:00Z' }),
    ];
    const idx = makeIndex(pointers);

    const writeResult = await saveMemoryIndex(PROJECT_ROOT, idx);
    expect(writeResult.success).toBe(true);

    const loadResult = await loadMemoryIndex(PROJECT_ROOT);
    expect(loadResult.success).toBe(true);
    if (!loadResult.success) return;

    const loaded = loadResult.data;
    expect(loaded.version).toBe(1);
    expect(loaded.pointers).toHaveLength(2);
    expect(loaded.pointers[0]!.topic_key).toBe('a');
    expect(loaded.pointers[0]!.summary).toBe('first');
    expect(loaded.pointers[1]!.topic_key).toBe('b');
    expect(loaded.pointers[1]!.summary).toBe('second');
    expect(loaded.pointers[1]!.tags).toEqual(['auth', 'jwt']);
  });

  test('saved file is valid Markdown with heading and sentinels', async () => {
    const idx = makeIndex();
    await saveMemoryIndex(PROJECT_ROOT, idx);

    const content = await readFile(MEMORY_FILE, 'utf-8');
    expect(content).toMatch(/^# Memory Index/m);
    expect(content).toContain('<!-- memory-index-start -->');
    expect(content).toContain('<!-- memory-index-end -->');
    expect(content).toContain('```yaml');
  });

  test('saved file has well-formed Markdown structure (heading, fence, footer, separator)', async () => {
    const idx = makeIndex();
    await saveMemoryIndex(PROJECT_ROOT, idx);

    const content = await readFile(MEMORY_FILE, 'utf-8');
    // Sentinels must bracket the YAML fence in order
    const startIdx = content.indexOf('<!-- memory-index-start -->');
    const fenceOpenIdx = content.indexOf('```yaml', startIdx);
    const fenceCloseIdx = content.indexOf('```', fenceOpenIdx + 1);
    const endIdx = content.indexOf('<!-- memory-index-end -->', fenceCloseIdx);

    expect(startIdx).toBeGreaterThan(-1);
    expect(fenceOpenIdx).toBeGreaterThan(startIdx);
    expect(fenceCloseIdx).toBeGreaterThan(fenceOpenIdx);
    expect(endIdx).toBeGreaterThan(fenceCloseIdx);

    // Horizontal rule separator before footer
    expect(content).toMatch(/\n---\n/);
  });

  test('human-readable without tooling', async () => {
    const idx = makeIndex();
    await saveMemoryIndex(PROJECT_ROOT, idx);

    const content = await readFile(MEMORY_FILE, 'utf-8');
    expect(content).toContain('This file is the persistent pointer index');
    expect(content).toContain('Do not edit the YAML block below manually');
  });

  test('loadMemoryIndex returns error when file does not exist', async () => {
    const result = await loadMemoryIndex(PROJECT_ROOT);
    expect(result.success).toBe(false);
  });

  test('loadMemoryIndex rejects file without sentinels', async () => {
    await mkdir(MEMORY_DIR, { recursive: true });
    await writeFile(MEMORY_FILE, '# Memory Index\n\nJust some text.\n', 'utf-8');

    const result = await loadMemoryIndex(PROJECT_ROOT);
    expect(result.success).toBe(false);
  });

  test('loadMemoryIndex rejects file with malformed YAML in block', async () => {
    await mkdir(MEMORY_DIR, { recursive: true });
    const content = `# Memory Index

<!-- memory-index-start -->
\`\`\`yaml
version: 1
pointers: [
not valid yaml
\`\`\`
<!-- memory-index-end -->
`;
    await writeFile(MEMORY_FILE, content, 'utf-8');

    const result = await loadMemoryIndex(PROJECT_ROOT);
    expect(result.success).toBe(false);
  });

  test('saveMemoryIndex creates .codeconductor directory', async () => {
    const idx = makeIndex();
    const result = await saveMemoryIndex(PROJECT_ROOT, idx);
    expect(result.success).toBe(true);

    const { existsSync } = await import('node:fs');
    expect(existsSync(MEMORY_DIR)).toBe(true);
    expect(existsSync(MEMORY_FILE)).toBe(true);
  });

  test('multiple save/load cycles are stable', async () => {
    const idx1 = makeIndex([makePointer({ topic_key: 'a', id: 1 })]);
    await saveMemoryIndex(PROJECT_ROOT, idx1);

    const loaded1 = await loadMemoryIndex(PROJECT_ROOT);
    expect(loaded1.success).toBe(true);
    if (!loaded1.success) return;

    const idx2 = addPointer(loaded1.data, makePointer({ topic_key: 'b', id: 2 }));
    await saveMemoryIndex(PROJECT_ROOT, idx2);

    const loaded2 = await loadMemoryIndex(PROJECT_ROOT);
    expect(loaded2.success).toBe(true);
    if (!loaded2.success) return;

    expect(loaded2.data.pointers).toHaveLength(2);
  });

  test('saveMemoryIndex rejects invalid index and returns error result', async () => {
    // Cast to bypass TS — the whole point is to feed invalid data
    const invalid = { version: 2, pointers: [makePointer()] } as unknown as MemoryIndex;
    const result = await saveMemoryIndex(PROJECT_ROOT, invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(Error);
    }
  });

  test('saveMemoryIndex rejects index with invalid pointer', async () => {
    const invalidPointer = { ...makePointer(), topic_key: '' };
    const invalid = { version: 1, pointers: [invalidPointer] } as unknown as MemoryIndex;
    const result = await saveMemoryIndex(PROJECT_ROOT, invalid);
    expect(result.success).toBe(false);
  });

  test('saveMemoryIndex overwrites existing file', async () => {
    const idx1 = makeIndex([makePointer({ topic_key: 'first', id: 1 })]);
    await saveMemoryIndex(PROJECT_ROOT, idx1);

    const idx2 = makeIndex([makePointer({ topic_key: 'second', id: 2 })]);
    await saveMemoryIndex(PROJECT_ROOT, idx2);

    const loaded = await loadMemoryIndex(PROJECT_ROOT);
    expect(loaded.success).toBe(true);
    if (!loaded.success) return;
    expect(loaded.data.pointers).toHaveLength(1);
    expect(loaded.data.pointers[0]!.topic_key).toBe('second');
  });

  test('loadMemoryIndex rejects file with sentinels but no YAML block', async () => {
    await mkdir(MEMORY_DIR, { recursive: true });
    const content = `# Memory Index

<!-- memory-index-start -->
just some text, no fence
<!-- memory-index-end -->
`;
    await writeFile(MEMORY_FILE, content, 'utf-8');

    const result = await loadMemoryIndex(PROJECT_ROOT);
    expect(result.success).toBe(false);
  });

  test('loadMemoryIndex rejects empty file', async () => {
    await mkdir(MEMORY_DIR, { recursive: true });
    await writeFile(MEMORY_FILE, '', 'utf-8');

    const result = await loadMemoryIndex(PROJECT_ROOT);
    expect(result.success).toBe(false);
  });

  test('saved file contains Last updated timestamp and pointer count footer', async () => {
    const idx = makeIndex([
      makePointer({ topic_key: 'a', id: 1 }),
      makePointer({ topic_key: 'b', id: 2 }),
    ]);
    await saveMemoryIndex(PROJECT_ROOT, idx);

    const content = await readFile(MEMORY_FILE, 'utf-8');
    expect(content).toMatch(/_Last updated: \d{4}-\d{2}-\d{2}T/);
    expect(content).toMatch(/Total pointers: 2_/);
  });
});

describe('memory-index: 40KB truncation', () => {
  beforeEach(async () => {
    await cleanup();
  });

  afterEach(async () => {
    await cleanup();
  });

  test('truncates oldest pointers when file exceeds 40KB', async () => {
    // Create enough pointers to exceed 40KB
    const pointers: MemoryPointer[] = [];
    for (let i = 0; i < 500; i++) {
      pointers.push(
        makePointer({
          topic_key: `topic/${i}`,
          id: i + 1,
          summary: `Summary for pointer ${i} with enough text to take space and push the file size up`,
          timestamp: `2025-01-${String((i % 28) + 1).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00:00Z`,
          tags: [`tag${i % 5}`, `cat${i % 3}`],
        })
      );
    }
    const idx = makeIndex(pointers);

    const writeResult = await saveMemoryIndex(PROJECT_ROOT, idx);
    expect(writeResult.success).toBe(true);

    const loaded = await loadMemoryIndex(PROJECT_ROOT);
    expect(loaded.success).toBe(true);
    if (!loaded.success) return;

    // Should have fewer pointers than original
    expect(loaded.data.pointers.length).toBeLessThan(500);

    // File should be under 40KB
    const content = await readFile(MEMORY_FILE, 'utf-8');
    expect(Buffer.byteLength(content, 'utf-8')).toBeLessThanOrEqual(40960);

    // Should contain truncation notice
    expect(content).toMatch(/truncated from/);
  });

  test('does not truncate when under 40KB', async () => {
    const idx = makeIndex([makePointer()]);
    await saveMemoryIndex(PROJECT_ROOT, idx);

    const loaded = await loadMemoryIndex(PROJECT_ROOT);
    expect(loaded.success).toBe(true);
    if (!loaded.success) return;
    expect(loaded.data.pointers).toHaveLength(1);
    expect(loaded.data.pointers[0]!.topic_key).toBe('architecture/auth-model');
  });

  test('preserves newest pointers when truncating (oldest first by timestamp)', async () => {
    // Build a sequence with strictly increasing timestamps so we can predict
    // exactly which ones survive truncation. Use hour granularity within a
    // single month to keep all timestamps valid ISO 8601.
    const pointers: MemoryPointer[] = [];
    const baseEpoch = Date.UTC(2025, 0, 1, 0, 0, 0);
    for (let i = 0; i < 500; i++) {
      // Each pointer is 1 hour after the previous — strictly increasing
      const ts = new Date(baseEpoch + i * 3600_000).toISOString();
      pointers.push(
        makePointer({
          topic_key: `topic/${i}`,
          id: i + 1,
          summary: `Summary for pointer ${i} with enough text to take space and push the file size up`,
          timestamp: ts,
          tags: [],
        })
      );
    }
    const idx = makeIndex(pointers);

    const writeResult = await saveMemoryIndex(PROJECT_ROOT, idx);
    expect(writeResult.success).toBe(true);

    const loaded = await loadMemoryIndex(PROJECT_ROOT);
    expect(loaded.success).toBe(true);
    if (!loaded.success) return;

    // The remaining pointers must be a suffix of the original (newest preserved)
    const remaining = loaded.data.pointers;
    const originalIds = pointers.map((p) => p.id);
    const remainingIds = remaining.map((p) => p.id);
    const firstKeptId = remainingIds[0]!;
    const expectedIds = originalIds.slice(originalIds.indexOf(firstKeptId));
    expect(remainingIds).toEqual(expectedIds);

    // The newest pointer (id=500) must always be present after truncation
    expect(remainingIds).toContain(500);

    // No pointer older than the first kept one should remain
    const cutoffIdx = originalIds.indexOf(firstKeptId);
    for (const id of remainingIds) {
      expect(originalIds.indexOf(id)).toBeGreaterThanOrEqual(cutoffIdx);
    }
  });

  test('footer shows truncated count when truncation occurs', async () => {
    const pointers: MemoryPointer[] = [];
    for (let i = 0; i < 500; i++) {
      pointers.push(
        makePointer({
          topic_key: `topic/${i}`,
          id: i + 1,
          summary: `Summary for pointer ${i} with enough text to take space and push the file size up`,
          timestamp: `2025-01-${String((i % 28) + 1).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00:00Z`,
        })
      );
    }
    const idx = makeIndex(pointers);

    await saveMemoryIndex(PROJECT_ROOT, idx);

    const content = await readFile(MEMORY_FILE, 'utf-8');
    expect(content).toMatch(/\(truncated from 500\)/);
  });

  test('console.warn is emitted when truncation occurs', async () => {
    const warnSpy = mock(() => {});
    const originalWarn = console.warn;
    console.warn = warnSpy as unknown as typeof console.warn;

    try {
      const pointers: MemoryPointer[] = [];
      for (let i = 0; i < 500; i++) {
        pointers.push(
          makePointer({
            topic_key: `topic/${i}`,
            id: i + 1,
            summary: `Summary for pointer ${i} with enough text to take space and push the file size up`,
            timestamp: `2025-01-${String((i % 28) + 1).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00:00Z`,
          })
        );
      }
      await saveMemoryIndex(PROJECT_ROOT, makeIndex(pointers));

      expect(warnSpy).toHaveBeenCalledTimes(1);
      const call = warnSpy.mock.calls[0]![0] as string;
      expect(call).toMatch(/Memory index truncated:/);
      expect(call).toMatch(/removed \d+ oldest pointers/);
      expect(call).toMatch(/40KB/);
    } finally {
      console.warn = originalWarn;
    }
  });

  test('does not emit warning or truncate footer for small index', async () => {
    const warnSpy = mock(() => {});
    const originalWarn = console.warn;
    console.warn = warnSpy as unknown as typeof console.warn;

    try {
      await saveMemoryIndex(PROJECT_ROOT, makeIndex([makePointer()]));

      expect(warnSpy).not.toHaveBeenCalled();

      const content = await readFile(MEMORY_FILE, 'utf-8');
      expect(content).not.toMatch(/truncated from/);
      expect(content).toMatch(/Total pointers: 1_/);
    } finally {
      console.warn = originalWarn;
    }
  });

  test('empty index saves without truncation and no warning', async () => {
    const warnSpy = mock(() => {});
    const originalWarn = console.warn;
    console.warn = warnSpy as unknown as typeof console.warn;

    try {
      const result = await saveMemoryIndex(PROJECT_ROOT, makeIndex([]));
      expect(result.success).toBe(true);
      expect(warnSpy).not.toHaveBeenCalled();

      const loaded = await loadMemoryIndex(PROJECT_ROOT);
      expect(loaded.success).toBe(true);
      if (loaded.success) {
        expect(loaded.data.pointers).toEqual([]);
      }
    } finally {
      console.warn = originalWarn;
    }
  });
});
