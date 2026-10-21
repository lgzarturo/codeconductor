import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs, routeCommand } from '../../src/cli/router';
import { buildCodeIndex, saveCodeIndex } from '../../src/core/code-index/code-index';
import { structurePrompt } from '../../src/core/ccep/prompt-structurer';

const POLICY = `version: 1
runtime:
  network:
    default: deny
    allowDomains:
      - github.com
denyRead:
  - "**/.env"
denyWrite:
  - ".git/**"
secretPatterns: []
commands:
  allow:
    - "git status"
`;

describe('prompt structurer', () => {
  let dir: string;

  beforeEach(async () => {
    dir = resolve(tmpdir(), `cc-struct-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    await mkdir(join(dir, 'src', 'api'), { recursive: true });
    await writeFile(join(dir, 'src', 'api', 'a.ts'), 'export const a = 1;\n');
    await writeFile(join(dir, 'policy.yml'), POLICY);
    const built = await buildCodeIndex(dir);
    if (!built.success) throw new Error('fixture index build failed');
    await saveCodeIndex(dir, built.data);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('envelope carries XML sections with the escaped verbatim request', async () => {
    const result = await structurePrompt(dir, { request: 'Fix <b>bold</b> bug' });
    expect(result.envelope).toContain('<context>');
    expect(result.envelope).toContain('<constraints>');
    expect(result.envelope).toContain('<task>');
    expect(result.envelope).toContain('Fix &lt;b&gt;bold&lt;/b&gt; bug');
    expect(result.envelope).not.toContain('<b>bold</b>');
    expect(result.card.title).toBe('Fix <b>bold</b> bug');
  });

  test('scope entries resolve to files; unknown scope warns', async () => {
    const known = await structurePrompt(dir, { request: 'x', scope: ['src/api'] });
    expect(known.card.scopeFiles).toEqual(['src/api/a.ts']);
    const unknown = await structurePrompt(dir, { request: 'x', scope: ['src/nope'] });
    expect(unknown.card.scopeFiles).toEqual([]);
    expect(unknown.warnings.join(' ')).toMatch(/scope/i);
  });

  test('missing index degrades with a build hint', async () => {
    await rm(join(dir, '.codeconductor', 'code-index.json'), { force: true });
    const result = await structurePrompt(dir, { request: 'x', scope: ['src/api'] });
    expect(result.card.scopeFiles).toEqual([]);
    expect(result.warnings.join(' ')).toMatch(/code-index build/);
    expect(result.envelope).toContain('<task>');
  });

  test('missing policy falls back to baseline constraints with a warning', async () => {
    await rm(join(dir, 'policy.yml'), { force: true });
    const result = await structurePrompt(dir, { request: 'x' });
    expect(result.envelope).toContain('secrets');
    expect(result.warnings.join(' ')).toMatch(/policy\.yml/);
  });

  test('role line mirrors the dispatch write surface', async () => {
    const tester = await structurePrompt(dir, { request: 'x', role: 'tester' });
    expect(tester.envelope).toMatch(/tester.*test files only/i);
    const impl = await structurePrompt(dir, { request: 'x', role: 'implementer' });
    expect(impl.envelope).toMatch(/implementer.*test files are read-only/i);
  });

  test('ccep structure serves card and envelope', async () => {
    const json = await routeCommand(
      parseArgs(['ccep', 'structure', 'Add endpoint', '--scope', 'src/api', '--output=json']),
      dir,
    );
    expect(json.code).toBe(0);
    expect(json.data).toMatchObject({ command: 'ccep structure' });
    expect((json.data as { envelope: string }).envelope).toContain('<task>');
    const human = await routeCommand(parseArgs(['ccep', 'structure', 'Add endpoint']), dir);
    expect(human.code).toBe(0);
    expect((human.data as { output: string }).output).toContain('<context>');
  });

  test('ccep structure requires a request', async () => {
    const result = await routeCommand(parseArgs(['ccep', 'structure']), dir);
    expect(result.code).toBe(1);
  });
});
