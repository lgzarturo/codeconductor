import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  applySingleFile,
  copyFromManifest,
  listFilesRecursive,
  mergeDeep,
  renderTemplate,
  resolveEntryFiles,
} from '../../../../src/core/presets/file-copier';
import {
  MANAGED_BEGIN_MARKER,
  MANAGED_END_MARKER,
} from '../../../../src/core/filesystem/safe-merger';
import type { ModelConfig } from '../../../../src/validation/schemas';

const MODEL_CONFIG: ModelConfig = {
  target: 'claude',
  agents: { architect: { claude: 'opus-x', opencode: 'oc-x' } },
};

let ROOT: string;
const tmp = async (prefix: string) => mkdtemp(join(ROOT, prefix));

beforeAll(async () => {
  ROOT = await mkdtemp(join(tmpdir(), 'cc-copier-'));
});

afterAll(async () => {
  await rm(ROOT, { recursive: true, force: true });
});

describe('core/presets/file-copier', () => {
  describe('listFilesRecursive', () => {
    test('returns every file path relative to the base directory', async () => {
      const dir = await tmp('list-');
      await writeFile(join(dir, 'a.txt'), 'a');
      await mkdir(join(dir, 'sub'), { recursive: true });
      await writeFile(join(dir, 'sub', 'b.txt'), 'b');

      const files = (await listFilesRecursive(dir)).sort();
      expect(files).toEqual(['a.txt', join('sub', 'b.txt')]);
    });
  });

  describe('mergeDeep', () => {
    test('adds new keys and overrides scalars', () => {
      expect(mergeDeep({ a: 1 }, { b: 2, a: 3 })).toEqual({ a: 3, b: 2 });
    });

    test('unions arrays and de-duplicates', () => {
      expect(mergeDeep({ arr: [1, 2] }, { arr: [2, 3] })).toEqual({ arr: [1, 2, 3] });
    });

    test('recursively merges nested objects', () => {
      expect(mergeDeep({ o: { x: 1 } }, { o: { y: 2 } })).toEqual({ o: { x: 1, y: 2 } });
    });
  });

  describe('renderTemplate', () => {
    test('single agent file: substitutes the target model and per-provider models', () => {
      const out = renderTemplate('M={{MODEL}} C={{MODEL_CLAUDE}}', MODEL_CONFIG, 'architect.md');
      expect(out).toBe('M=opus-x C=opus-x');
    });

    test('replaces commit and complementary placeholders', () => {
      const out = renderTemplate('{{COMMIT_STYLE}}|{{COMMIT_WORKFLOW}}|{{COMPLEMENTARY_RULES}}', MODEL_CONFIG, 'architect.md');
      expect(out).not.toContain('{{COMMIT_STYLE}}');
      expect(out).not.toContain('{{COMMIT_WORKFLOW}}');
      expect(out).not.toContain('{{COMPLEMENTARY_RULES}}');
    });

    test('monolithic file: renders the matching agent section', () => {
      const out = renderTemplate('### architect\n{{MODEL_CLAUDE}}\n', MODEL_CONFIG, 'AGENTS.md');
      expect(out).toContain('opus-x');
    });
  });

  describe('resolveEntryFiles', () => {
    test('maps a single source file to its destination', async () => {
      const presets = await tmp('pre-');
      await writeFile(join(presets, 'x.md'), 'x');
      const files = await resolveEntryFiles(
        { src: 'x.md', dest: 'out.md', strategy: 'overwrite' },
        presets,
        join(presets, 'base'),
      );
      expect(files).toHaveLength(1);
      expect(files[0]?.dest.endsWith('out.md')).toBe(true);
    });

    test('expands a source directory into all its files', async () => {
      const presets = await tmp('pre-');
      await mkdir(join(presets, 'agents'), { recursive: true });
      await writeFile(join(presets, 'agents', 'a.md'), 'a');
      await writeFile(join(presets, 'agents', 'b.md'), 'b');
      const files = await resolveEntryFiles(
        { src: 'agents', dest: 'agents', strategy: 'overwrite' },
        presets,
        join(presets, 'base'),
      );
      expect(files).toHaveLength(2);
    });

    test('returns nothing for a missing source', async () => {
      const presets = await tmp('pre-');
      const files = await resolveEntryFiles(
        { src: 'nope', dest: 'd', strategy: 'overwrite' },
        presets,
        presets,
      );
      expect(files).toEqual([]);
    });
  });

  describe('applySingleFile', () => {
    async function srcFile(content: string): Promise<string> {
      const dir = await tmp('src-');
      const path = join(dir, 'src.md');
      await writeFile(path, content);
      return path;
    }

    test("skip strategy reports 'skipped' without touching the FS", async () => {
      const dir = await tmp('dst-');
      const dest = join(dir, 'out.md');
      const result = await applySingleFile('any', dest, 'skip', false, false, false, null, 'en');
      expect(result.action).toBe('skipped');
      expect(existsSync(dest)).toBe(false);
    });

    test('writes a new file with overwrite strategy', async () => {
      const src = await srcFile('hello');
      const dir = await tmp('dst-');
      const dest = join(dir, 'nested', 'out.md');
      const result = await applySingleFile(src, dest, 'overwrite', false, false, false, null, 'en');
      expect(result.action).toBe('written');
      expect(await readFile(dest, 'utf-8')).toBe('hello');
    });

    test('dry-run reports the action but writes nothing', async () => {
      const src = await srcFile('hello');
      const dir = await tmp('dst-');
      const dest = join(dir, 'out.md');
      const result = await applySingleFile(src, dest, 'overwrite', false, true, false, null, 'en');
      expect(result.dryRun).toBe(true);
      expect(existsSync(dest)).toBe(false);
    });

    test('append strategy concatenates onto an existing file', async () => {
      const src = await srcFile('NEW');
      const dir = await tmp('dst-');
      const dest = join(dir, 'out.md');
      await writeFile(dest, 'OLD');
      const result = await applySingleFile(src, dest, 'append', false, false, false, null, 'en');
      expect(result.action).toBe('appended');
      const content = await readFile(dest, 'utf-8');
      expect(content).toContain('OLD');
      expect(content).toContain('NEW');
    });

    test('merge-json deep-merges JSON documents', async () => {
      const src = await srcFile('{"b":2}');
      const dir = await tmp('dst-');
      const dest = join(dir, 'out.json');
      await writeFile(dest, '{"a":1}');
      const result = await applySingleFile(src, dest, 'merge-json', false, false, false, null, 'en');
      expect(result.action).toBe('merged');
      expect(JSON.parse(await readFile(dest, 'utf-8'))).toEqual({ a: 1, b: 2 });
    });

    test('merge-managed writes the managed block when no file exists', async () => {
      const src = await srcFile(`${MANAGED_BEGIN_MARKER}\nbody\n${MANAGED_END_MARKER}`);
      const dir = await tmp('dst-');
      const dest = join(dir, 'AGENTS.md');
      const result = await applySingleFile(src, dest, 'merge-managed', false, false, false, null, 'en');
      expect(result.action).toBe('written');
      expect(existsSync(dest)).toBe(true);
    });

    test('error case: an unreadable source is reported as an error', async () => {
      const dir = await tmp('dst-');
      const result = await applySingleFile(
        join(dir, 'missing-src.md'),
        join(dir, 'out.md'),
        'overwrite',
        false,
        false,
        false,
        null,
        'en',
      );
      expect(result.action).toBe('error');
      expect(result.error).toContain('Cannot read source');
    });

    test('error case: invalid incoming JSON in merge-json is reported', async () => {
      const src = await srcFile('not json');
      const dir = await tmp('dst-');
      const dest = join(dir, 'out.json');
      await writeFile(dest, '{}');
      const result = await applySingleFile(src, dest, 'merge-json', false, false, false, null, 'en');
      expect(result.action).toBe('error');
      expect(result.error).toContain('JSON merge failed');
    });
  });

  describe('copyFromManifest', () => {
    test('dry-run returns per-file results without writing', async () => {
      const presets = await tmp('pre-');
      await writeFile(join(presets, 'file.md'), 'content');
      const base = await tmp('base-');
      const results = await copyFromManifest(
        { target: 'claude', entries: [{ src: 'file.md', dest: 'file.md', strategy: 'overwrite' }] },
        presets,
        base,
        false,
        true,
        false,
      );
      expect(results).toHaveLength(1);
      expect(results[0]?.dryRun).toBe(true);
      expect(existsSync(join(base, 'file.md'))).toBe(false);
    });

    test('writes files to the base directory when not a dry-run', async () => {
      const presets = await tmp('pre-');
      await writeFile(join(presets, 'file.md'), 'content');
      const base = await tmp('base-');
      const results = await copyFromManifest(
        { target: 'claude', entries: [{ src: 'file.md', dest: 'file.md', strategy: 'overwrite' }] },
        presets,
        base,
        false,
        false,
        false,
      );
      expect(results[0]?.action).toBe('written');
      expect(await readFile(join(base, 'file.md'), 'utf-8')).toBe('content');
    });
  });
});
