/**
 * Regression: the published bundle runs under Node (`npx cc-codeconductor`),
 * but `runCompileCheck` used `Bun.spawn`, so `captureTddSuiteEvidence` (and the
 * compile-check loop behind it) failed with `Bun is not defined`. Like the
 * `ccep parse` regression, this must run the built `dist/` with the real
 * `node` binary — `bun test` alone cannot catch it.
 */
import { beforeAll, describe, expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = dirname(fileURLToPath(new URL('../../package.json', import.meta.url)));

function build(script: string): void {
  const built = spawnSync('bun', ['run', script], { cwd: repoRoot, encoding: 'utf-8' });
  expect(built.status).toBe(0);
}

async function captureUnderNode(testScript: string, phase: 'red' | 'green') {
  const cwd = await mkdtemp(join(tmpdir(), 'cc-node-tdd-'));
  try {
    await writeFile(
      join(cwd, 'package.json'),
      JSON.stringify({ name: 'fixture', type: 'module', scripts: { test: testScript } }),
    );
    const lib = join(repoRoot, 'dist/library.js');
    const program = `
      import { captureTddSuiteEvidence } from ${JSON.stringify(lib)};
      const r = await captureTddSuiteEvidence(process.cwd(), 'T-1', { command: 'npm test', phase: ${JSON.stringify(phase)} });
      console.log(JSON.stringify(r));
    `;
    const run = spawnSync('node', ['--input-type=module', '-e', program], {
      cwd,
      encoding: 'utf-8',
    });
    return { run, cwd };
  } catch (e) {
    await rm(cwd, { recursive: true, force: true });
    throw e;
  }
}

describe('verification under Node runtime', () => {
  beforeAll(() => {
    build('build:cli');
    build('build:lib');
  }, 120_000);

  test('built bundles do not reference the Bun global', async () => {
    for (const file of ['dist/index.js', 'dist/library.js']) {
      const source = await readFile(join(repoRoot, file), 'utf-8');
      expect(source).not.toMatch(/\bBun\.(spawn|file|write|sleep)\b/);
    }
  });

  test('captureTddSuiteEvidence records RED for a failing suite', async () => {
    const { run, cwd } = await captureUnderNode('node -e "process.exit(1)"', 'red');
    try {
      expect(run.stderr).not.toContain('Bun is not defined');
      const result = JSON.parse(run.stdout);
      expect(result.success).toBe(true);
      expect(result.data.suiteFailed).toBe(true);
      expect(result.data.evidenceId).toStartWith('ev-tdd-T-1-');
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  }, 60_000);

  test('captureTddSuiteEvidence records GREEN for a passing suite', async () => {
    const { run, cwd } = await captureUnderNode('node -e "process.exit(0)"', 'green');
    try {
      const result = JSON.parse(run.stdout);
      expect(result.success).toBe(true);
      expect(result.data.suitePassed).toBe(true);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  }, 60_000);
});

describe('openspec delivery flow under Node runtime', () => {
  const cli = join(repoRoot, 'dist/index.js');
  const fixture = join(repoRoot, 'test/fixtures/backlog/BACKLOG.md');

  test('next, tdd capture and done close a test card with no Bun runtime', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'cc-node-flow-'));
    try {
      await cp(fixture, join(cwd, 'BACKLOG.md'));
      await writeFile(
        join(cwd, 'package.json'),
        JSON.stringify({ name: 'fixture', scripts: { test: 'node -e "process.exit(1)"' } }),
      );
      const cc = (...args: string[]) =>
        spawnSync('node', [cli, ...args, '--output=json'], { cwd, encoding: 'utf-8' });

      expect(cc('openspec', 'plan', 'BC-001').status).toBe(0);
      for (const phase of ['discover', 'design']) {
        expect(cc('openspec', 'start', `BC-001-${phase}`).status).toBe(0);
        expect(cc('openspec', 'done', `BC-001-${phase}`).status).toBe(0);
      }

      const next = cc('openspec', 'next');
      expect(next.status).toBe(0);
      expect(JSON.parse(next.stdout).taskCard.id).toBe('BC-001-test');

      expect(cc('openspec', 'start', 'BC-001-test').status).toBe(0);
      const red = cc('tdd', 'capture', '--task', 'BC-001-test', '--phase', 'red', '--command', 'npm test');
      expect(red.stderr).not.toContain('Bun is not defined');
      expect(red.status).toBe(0);
      expect(cc('openspec', 'done', 'BC-001-test').status).toBe(0);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  }, 120_000);
});
