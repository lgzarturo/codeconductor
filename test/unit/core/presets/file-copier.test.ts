import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
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

    test('returns paths in lexicographic order regardless of creation order', async () => {
      const dir = await tmp('list-order-');
      await writeFile(join(dir, 'c.txt'), 'c');
      await mkdir(join(dir, 'b'), { recursive: true });
      await writeFile(join(dir, 'b', 'z.txt'), 'z');
      await writeFile(join(dir, 'a.txt'), 'a');

      expect(await listFilesRecursive(dir)).toEqual(['a.txt', join('b', 'z.txt'), 'c.txt']);
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
      const result = await applySingleFile('any', dest, 'skip', false, false, false, null, 'en', dir);
      expect(result.action).toBe('skipped');
      expect(existsSync(dest)).toBe(false);
    });

    test('rejects writes when baseDir is omitted', async () => {
      const src = await srcFile('hello');
      const dir = await tmp('dst-');
      const dest = join(dir, 'out.md');
      const result = await applySingleFile(
        src,
        dest,
        'overwrite',
        false,
        false,
        false,
        null,
        'en',
      );
      expect(result.action).toBe('error');
      expect(result.error).toMatch(/baseDir is required/i);
      expect(existsSync(dest)).toBe(false);
    });

    test('writes a new file with overwrite strategy', async () => {
      const src = await srcFile('hello');
      const dir = await tmp('dst-');
      const dest = join(dir, 'nested', 'out.md');
      const result = await applySingleFile(src, dest, 'overwrite', false, false, false, null, 'en', dir);
      expect(result.action).toBe('written');
      expect(await readFile(dest, 'utf-8')).toBe('hello');
    });

    test('overwrite without force leaves an existing file intact', async () => {
      const src = await srcFile('NEW');
      const dir = await tmp('dst-');
      const dest = join(dir, 'out.md');
      await writeFile(dest, 'OLD');
      const result = await applySingleFile(src, dest, 'overwrite', false, false, false, null, 'en', dir);
      expect(result.action).toBe('skipped');
      expect(await readFile(dest, 'utf-8')).toBe('OLD');
    });

    test('overwrite with force replaces an existing file', async () => {
      const src = await srcFile('NEW');
      const dir = await tmp('dst-');
      const dest = join(dir, 'out.md');
      await writeFile(dest, 'OLD');
      const result = await applySingleFile(src, dest, 'overwrite', true, false, false, null, 'en', dir);
      expect(result.action).toBe('written');
      expect(await readFile(dest, 'utf-8')).toBe('NEW');
    });

    test('force overwrite rejects a destination symlink and preserves its target', async () => {
      const src = await srcFile('PWNED');
      const dir = await tmp('dst-');
      const target = join(dir, 'target.md');
      const dest = join(dir, 'out.md');
      await writeFile(target, 'ORIGINAL');
      try {
        await symlink(target, dest, 'file');
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'EPERM' || code === 'EACCES') return;
        throw error;
      }

      const result = await applySingleFile(
        src,
        dest,
        'overwrite',
        true,
        false,
        false,
        null,
        'en',
        dir,
      );

      expect(result.action).toBe('error');
      expect(result.error).toMatch(/symlink/i);
      expect(await readFile(target, 'utf-8')).toBe('ORIGINAL');
    });

    test('dry-run reports the action but writes nothing', async () => {
      const src = await srcFile('hello');
      const dir = await tmp('dst-');
      const dest = join(dir, 'out.md');
      const result = await applySingleFile(src, dest, 'overwrite', false, true, false, null, 'en', dir);
      expect(result.dryRun).toBe(true);
      expect(existsSync(dest)).toBe(false);
    });

    test('append strategy concatenates onto an existing file', async () => {
      const src = await srcFile('NEW');
      const dir = await tmp('dst-');
      const dest = join(dir, 'out.md');
      await writeFile(dest, 'OLD');
      const result = await applySingleFile(src, dest, 'append', false, false, false, null, 'en', dir);
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
      const result = await applySingleFile(src, dest, 'merge-json', false, false, false, null, 'en', dir);
      expect(result.action).toBe('merged');
      expect(JSON.parse(await readFile(dest, 'utf-8'))).toEqual({ a: 1, b: 2 });
    });

    test('merge-managed writes the managed block when no file exists', async () => {
      const src = await srcFile(`${MANAGED_BEGIN_MARKER}\nbody\n${MANAGED_END_MARKER}`);
      const dir = await tmp('dst-');
      const dest = join(dir, 'AGENTS.md');
      const result = await applySingleFile(src, dest, 'merge-managed', false, false, false, null, 'en', dir);
      expect(result.action).toBe('written');
      expect(existsSync(dest)).toBe(true);
    });

    test('merge-managed replaces only the managed block of a marked file without force', async () => {
      const src = await srcFile(`${MANAGED_BEGIN_MARKER}\nnew\n${MANAGED_END_MARKER}`);
      const dir = await tmp('dst-');
      const dest = join(dir, 'AGENTS.md');
      await writeFile(dest, `head\n${MANAGED_BEGIN_MARKER}\nold\n${MANAGED_END_MARKER}\ntail`);
      const result = await applySingleFile(src, dest, 'merge-managed', false, false, false, null, 'en', dir);
      expect(result.action).toBe('merged');
      const content = await readFile(dest, 'utf-8');
      expect(content).toBe(`head\n${MANAGED_BEGIN_MARKER}\nnew\n${MANAGED_END_MARKER}\ntail`);
    });

    test('merge-managed without force leaves a markerless file intact', async () => {
      const src = await srcFile(`${MANAGED_BEGIN_MARKER}\nnew\n${MANAGED_END_MARKER}`);
      const dir = await tmp('dst-');
      const dest = join(dir, 'AGENTS.md');
      await writeFile(dest, 'local only');
      const result = await applySingleFile(src, dest, 'merge-managed', false, false, false, null, 'en', dir);
      expect(result.action).toBe('skipped');
      expect(await readFile(dest, 'utf-8')).toBe('local only');
    });

    test('merge-managed with force replaces a markerless file with the incoming content', async () => {
      const incoming = `${MANAGED_BEGIN_MARKER}\nnew\n${MANAGED_END_MARKER}`;
      const src = await srcFile(incoming);
      const dir = await tmp('dst-');
      const dest = join(dir, 'AGENTS.md');
      await writeFile(dest, 'local only');
      const result = await applySingleFile(src, dest, 'merge-managed', true, false, false, null, 'en', dir);
      expect(result.action).toBe('written');
      expect(await readFile(dest, 'utf-8')).toBe(incoming);
    });

    test('merge-managed reports an error for partial markers even with force', async () => {
      const src = await srcFile(`${MANAGED_BEGIN_MARKER}\nnew\n${MANAGED_END_MARKER}`);
      const dir = await tmp('dst-');
      const dest = join(dir, 'AGENTS.md');
      const broken = `head\n${MANAGED_BEGIN_MARKER}\nunterminated`;
      await writeFile(dest, broken);
      const result = await applySingleFile(src, dest, 'merge-managed', true, false, false, null, 'en', dir);
      expect(result.action).toBe('error');
      expect(result.error).toContain('Managed merge failed');
      expect(await readFile(dest, 'utf-8')).toBe(broken);
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
        dir,
      );
      expect(result.action).toBe('error');
      expect(result.error).toContain('Cannot read source');
    });

    test('error case: invalid incoming JSON in merge-json is reported', async () => {
      const src = await srcFile('not json');
      const dir = await tmp('dst-');
      const dest = join(dir, 'out.json');
      await writeFile(dest, '{}');
      const result = await applySingleFile(src, dest, 'merge-json', false, false, false, null, 'en', dir);
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

    test('directory entries produce results in lexicographic order', async () => {
      const presets = await tmp('pre-');
      await mkdir(join(presets, 'agents', 'nested'), { recursive: true });
      await writeFile(join(presets, 'agents', 'c.md'), 'c');
      await writeFile(join(presets, 'agents', 'nested', 'z.md'), 'z');
      await writeFile(join(presets, 'agents', 'a.md'), 'a');
      const base = await tmp('base-');

      const results = await copyFromManifest(
        { target: 'claude', entries: [{ src: 'agents', dest: 'agents', strategy: 'overwrite' }] },
        presets,
        base,
        false,
        false,
        true,
      );

      expect(results.map((r) => r.dest)).toEqual([
        join(base, 'agents', 'a.md'),
        join(base, 'agents', 'c.md'),
        join(base, 'agents', 'nested', 'z.md'),
      ]);
    });

    test('refuses to write through a directory junction that escapes the base directory', async () => {
      const presets = await tmp('pre-');
      await writeFile(join(presets, 'file.md'), 'content');
      const base = await tmp('base-');
      const outside = await tmp('outside-');
      try {
        await symlink(outside, join(base, 'linkdir'), 'junction');
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'EPERM' || code === 'EACCES') return;
        throw error;
      }

      const results = await copyFromManifest(
        {
          target: 'claude',
          entries: [{ src: 'file.md', dest: 'linkdir/file.md', strategy: 'overwrite' }],
        },
        presets,
        base,
        false,
        false,
        true,
      );

      expect(results[0]?.action).toBe('error');
      expect(existsSync(join(outside, 'file.md'))).toBe(false);
    });

    test('refuses to write into a protected destination segment', async () => {
      const presets = await tmp('pre-');
      await writeFile(join(presets, 'file.md'), 'content');
      const base = await tmp('base-');

      const results = await copyFromManifest(
        {
          target: 'claude',
          entries: [{ src: 'file.md', dest: '.git/hooks/pre-commit', strategy: 'overwrite' }],
        },
        presets,
        base,
        false,
        false,
        true,
      );

      expect(results[0]?.action).toBe('error');
      expect(existsSync(join(base, '.git', 'hooks', 'pre-commit'))).toBe(false);
    });

    test('a forced rerun produces the same results and the same content', async () => {
      const presets = await tmp('pre-');
      await mkdir(join(presets, 'agents'), { recursive: true });
      await writeFile(join(presets, 'agents', 'a.md'), 'a');
      await writeFile(join(presets, 'agents', 'b.md'), 'b');
      const base = await tmp('base-');
      const manifest = {
        target: 'claude' as const,
        entries: [{ src: 'agents', dest: 'agents', strategy: 'overwrite' as const }],
      };

      const first = await copyFromManifest(manifest, presets, base, false, false, true);
      const second = await copyFromManifest(manifest, presets, base, false, false, true);

      expect(second).toEqual(first);
      expect(second.every((r) => r.action === 'written')).toBe(true);
      expect(await readFile(join(base, 'agents', 'a.md'), 'utf-8')).toBe('a');
    });
  });
});
