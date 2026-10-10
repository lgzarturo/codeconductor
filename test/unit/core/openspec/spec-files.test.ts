import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readMarkdownFiles,
  requirementBlocks,
  walkMarkdownFiles,
} from '../../../../src/core/openspec/spec-files';

let ROOT: string;

beforeAll(async () => {
  ROOT = await mkdtemp(join(tmpdir(), 'cc-spec-files-'));
});

afterAll(async () => {
  await rm(ROOT, { recursive: true, force: true });
});

describe('core/openspec/spec-files', () => {
  test('delta operations stop at unrelated sections', () => {
    const blocks = requirementBlocks('## ADDED Requirements\n### Requirement: Login\nThe system SHALL sign in.\n## Notes\n### Requirement: Documentation note\nInformational only.\n', 'auth');
    expect(blocks.map((block) => block.deltaOperation)).toEqual(['ADDED', undefined]);
  });

  test('rename pairs stop at unrelated sections', () => {
    const blocks = requirementBlocks('## RENAMED Requirements\n- FROM: `### Requirement: Login`\n- TO: `### Requirement: Member login`\n## Notes\n- FROM: `### Requirement: Example`\n- TO: `### Requirement: Other example`\n', 'auth');
    expect(blocks.map((block) => block.id)).toEqual(['req:auth/member-login']);
  });

  test('official delta requirements receive stable IDs and stop at delta sections', () => {
    const blocks = requirementBlocks([
      '## ADDED Requirements',
      '### Requirement: User login',
      'The system SHALL authenticate users.',
      '#### Scenario: Valid credentials',
      '- **WHEN** valid credentials are supplied',
      '- **THEN** the user is authenticated',
      '## REMOVED Requirements',
      '### Requirement: Password hints',
      '**Reason**: Hints expose secrets.',
    ].join('\n'));

    expect(blocks.map((block) => block.id)).toEqual([
      'req:spec/user-login',
      'req:spec/password-hints',
    ]);
    expect(blocks[0]?.markdown).not.toContain('## REMOVED Requirements');
    expect(blocks.map((block) => Reflect.get(block, 'deltaOperation'))).toEqual([
      'ADDED', 'REMOVED',
    ]);
  });

  test('requirementBlocks splits on headings and extracts FR ids', () => {
    const blocks = requirementBlocks(
      [
        '# Capability',
        '',
        '### Requirement: FR-001 First',
        '',
        'The system MUST do one thing.',
        '',
        '### Requirement: FR-002 Second',
        '',
        'The system MUST do another thing.',
        '',
      ].join('\n'),
    );

    expect(blocks.map((b) => b.id)).toEqual(['FR-001', 'FR-002']);
    expect(blocks[0]?.markdown).toContain('do one thing');
    expect(blocks[1]?.markdown).toContain('do another thing');
    expect(blocks[0]?.markdown).not.toContain('FR-002');
  });

  test('requirementBlocks gives untagged requirements a stable default capability ID', () => {
    const blocks = requirementBlocks('### Requirement: untagged\n\nThe system MUST do it.\n');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.id).toBe('req:spec/untagged');
  });

  test('walkMarkdownFiles lists nested markdown and ignores the rest', async () => {
    const dir = await mkdtemp(join(ROOT, 'walk-'));
    await writeFile(join(dir, 'a.md'), 'a');
    await writeFile(join(dir, 'skip.txt'), 'x');
    await mkdir(join(dir, 'nested'), { recursive: true });
    await writeFile(join(dir, 'nested', 'b.md'), 'b');

    const files = await walkMarkdownFiles(dir);
    expect(files.sort()).toEqual([join(dir, 'a.md'), join(dir, 'nested', 'b.md')]);
    expect(await walkMarkdownFiles(join(dir, 'missing'))).toEqual([]);
  });

  test('readMarkdownFiles returns paths with contents in one pass', async () => {
    const dir = await mkdtemp(join(ROOT, 'read-'));
    await writeFile(join(dir, 'a.md'), 'hello');

    const files = await readMarkdownFiles(dir);
    expect(files).toEqual([{ path: join(dir, 'a.md'), content: 'hello' }]);
  });
});
