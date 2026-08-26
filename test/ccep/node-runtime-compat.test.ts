/**
 * Regression: `ccep` subcommands crashed under Node with
 * `TypeError [ERR_INVALID_ARG_TYPE]` because `BUNDLED_WORKFLOWS_DIR` used
 * `import.meta.dir`, a Bun-only property that is `undefined` in Node.
 * `npx cc-codeconductor` always runs the published bundle under Node, so
 * this must be exercised against the built `dist/index.js` with the real
 * `node` binary — running it via `bun` (like the other CLI tests) would not
 * catch this.
 */
import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = dirname(fileURLToPath(new URL('../../package.json', import.meta.url)));

describe('ccep CLI under Node runtime', () => {
  test('ccep parse succeeds when the built bundle is run with node', async () => {
    const build = spawnSync('bun', ['run', 'build:cli'], { cwd: repoRoot, encoding: 'utf-8' });
    expect(build.status).toBe(0);

    const cliJs = join(repoRoot, 'dist/index.js');
    const cwd = await mkdtemp(join(tmpdir(), 'ccep-node-runtime-'));
    try {
      await writeFile(join(cwd, 'package.json'), JSON.stringify({ name: 'fixture', type: 'module' }));

      const run = spawnSync(
        'node',
        [cliJs, 'ccep', 'parse', '--command', 'fix', 'login fails on Safari', '--output=json'],
        { cwd, encoding: 'utf-8' },
      );

      expect(run.status).toBe(0);
      const json = JSON.parse(run.stdout);
      expect(json.success).toBe(true);
      expect(json.envelope.command).toBe('fix');
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  }, 60_000);
});
