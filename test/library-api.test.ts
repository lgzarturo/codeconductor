/**
 * Public library contract (TC4): no internals, and a built bundle that an
 * out-of-tree consumer can import.
 */
import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import * as api from '../src/index';

const repoRoot = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));

describe('public library surface', () => {
  test('re-exports orchestrator, LoopEngine, verification, schemas, and loop domain', () => {
    expect(typeof api.getNextTask).toBe('function');
    expect(typeof api.startTask).toBe('function');
    expect(typeof api.completeTask).toBe('function');
    expect(typeof api.LoopEngine).toBe('function');
    expect(typeof api.runLoop).toBe('function');
    expect(typeof api.runVerification).toBe('function');
    expect(typeof api.loopStateMachine).toBe('function');
    expect(typeof api.tddCycleStateMachine).toBe('function');
    expect(typeof api.captureTddSuiteEvidence).toBe('function');
    expect(typeof api.createInitialState).toBe('function');
    expect(api.GoalGraphSchema).toBeDefined();
    expect(api.CanonicalTaskCardSchema).toBeDefined();
  });

  test('does not expose infrastructure or *-internal modules', async () => {
    const src = await readFile(join(repoRoot, 'src/index.ts'), 'utf-8');
    const exportLines = src
      .split('\n')
      .filter((line) => /^\s*export\s/.test(line))
      .join('\n');
    expect(exportLines).not.toMatch(/infrastructure\//);
    expect(exportLines).not.toMatch(/-internal/);
    expect('downloadPinnedBinaryWithInternals' in api).toBe(false);
  });
});

describe('external consumer smoke', () => {
  let consumerDir: string | undefined;

  afterAll(async () => {
    if (consumerDir) await rm(consumerDir, { recursive: true, force: true });
  });

  test('a package outside the repo can import the built library', async () => {
    const build = spawnSync('bun', ['run', 'scripts/build.ts'], {
      cwd: repoRoot,
      encoding: 'utf-8',
    });
    expect(build.status).toBe(0);

    const libraryJs = join(repoRoot, 'dist/library.js');
    const libraryDts = join(repoRoot, 'dist/index.d.ts');
    const cliJs = join(repoRoot, 'dist/index.js');
    expect(await Bun.file(libraryJs).exists()).toBe(true);
    expect(await Bun.file(libraryDts).exists()).toBe(true);
    expect(await Bun.file(cliJs).exists()).toBe(true);

    consumerDir = await mkdtemp(join(tmpdir(), 'cc-lib-consumer-'));
    const consumerPath = join(consumerDir, 'consumer.mjs');
    await writeFile(
      join(consumerDir, 'package.json'),
      JSON.stringify({ name: 'cc-lib-consumer', type: 'module', private: true }),
    );
    await writeFile(
      consumerPath,
      `import { LoopEngine, runLoop, runVerification, loopStateMachine, GoalGraphSchema } from ${JSON.stringify(libraryJs)};
if (typeof LoopEngine !== 'function') process.exit(2);
if (typeof runLoop !== 'function') process.exit(3);
if (typeof runVerification !== 'function') process.exit(4);
if (typeof loopStateMachine !== 'function') process.exit(5);
if (!GoalGraphSchema) process.exit(6);
console.log('library-ok');
`,
    );

    const run = spawnSync('bun', [consumerPath], { encoding: 'utf-8' });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('library-ok');
  }, 60_000);
});
