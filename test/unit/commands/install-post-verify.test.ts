import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyRenderedFiles } from '../../../src/commands/install.command';
import type { FileCopyResult } from '../../../src/core/presets/file-copier';
import type { InstallManifest } from '../../../src/validation/schemas';

let base: string;

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), 'cc-post-verify-'));
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

function manifestWithTemplateEntry(dest: string): InstallManifest {
  return {
    target: 'claude',
    entries: [{ src: 'x', dest, strategy: 'overwrite', template: true }],
  };
}

function resultFor(dest: string): FileCopyResult {
  return { src: 'x', dest, action: 'written' };
}

describe('verifyRenderedFiles', () => {
  test('reports no warnings for a clean rendered file', async () => {
    const dest = join(base, 'clean', 'AGENTS.md');
    await mkdir(join(base, 'clean'), { recursive: true });
    await writeFile(dest, '# Agent contract\n\nNo placeholders here.\n');

    const warnings = await verifyRenderedFiles(
      manifestWithTemplateEntry('clean'),
      base,
      [resultFor(dest)]
    );
    expect(warnings).toEqual([]);
  });

  test('flags a leaked {{PLACEHOLDER}} in a rendered template file', async () => {
    const dest = join(base, 'leak', 'AGENTS.md');
    await mkdir(join(base, 'leak'), { recursive: true });
    await writeFile(dest, 'Model: {{MODEL}}\n');

    const warnings = await verifyRenderedFiles(
      manifestWithTemplateEntry('leak'),
      base,
      [resultFor(dest)]
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('unresolved placeholder');
    expect(warnings[0]).toContain('{{MODEL}}');
  });

  test('flags a rendered SKILL.md whose identifier no longer matches its directory', async () => {
    const dest = join(base, 'skills', 'python', 'SKILL.md');
    await mkdir(join(base, 'skills', 'python'), { recursive: true });
    await writeFile(dest, '---\nname: not-python\ndescription: Wrong identifier.\n---\n\nBody.\n');

    const warnings = await verifyRenderedFiles(
      manifestWithTemplateEntry('skills'),
      base,
      [resultFor(dest)]
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('does not match its directory "python"');
  });

  test('flags a rendered SKILL.md with invalid frontmatter', async () => {
    const dest = join(base, 'skills-bad', 'broken', 'SKILL.md');
    await mkdir(join(base, 'skills-bad', 'broken'), { recursive: true });
    await writeFile(dest, 'No frontmatter fence at all.\n');

    const warnings = await verifyRenderedFiles(
      manifestWithTemplateEntry('skills-bad'),
      base,
      [resultFor(dest)]
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('missing');
  });

  test('skips files outside any template: true entry', async () => {
    const dest = join(base, 'plain', 'copy.md');
    await mkdir(join(base, 'plain'), { recursive: true });
    await writeFile(dest, 'Model: {{MODEL}}\n'); // would fail if checked

    const nonTemplateManifest: InstallManifest = {
      target: 'claude',
      entries: [{ src: 'x', dest: 'plain', strategy: 'overwrite' }],
    };
    const warnings = await verifyRenderedFiles(nonTemplateManifest, base, [resultFor(dest)]);
    expect(warnings).toEqual([]);
  });

  test('skips results that errored, were skipped, or were a dry run', async () => {
    const dest = join(base, 'skipped-case', 'AGENTS.md');
    // Never actually create the file — an errored/skipped/dry-run result
    // must not even attempt to read it back.
    const results: FileCopyResult[] = [
      { src: 'x', dest, action: 'error', error: 'boom' },
      { src: 'x', dest, action: 'skipped' },
      { src: 'x', dest, action: 'written', dryRun: true },
    ];
    const warnings = await verifyRenderedFiles(manifestWithTemplateEntry('skipped-case'), base, results);
    expect(warnings).toEqual([]);
  });
});
