#!/usr/bin/env bun
/**
 * Fast local test loop: full suite minus spawn/timeout-heavy files.
 * CI and `bun test` still run everything.
 */

import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = join(import.meta.dir, '..');
const TEST_ROOT = join(ROOT, 'test');

const DENY = new Set([
  'test/compile-checker.test.ts',
  'test/tdd-cycle.test.ts',
  'test/gates-pre-commit.test.ts',
]);

async function collectTestFiles(dir: string, acc: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectTestFiles(full, acc);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.test.ts')) {
      acc.push(relative(ROOT, full));
    }
  }
}

const files: string[] = [];
await collectTestFiles(TEST_ROOT, files);
const selected = files.filter((f) => !DENY.has(f)).sort();
if (selected.length === 0) {
  process.stderr.write('test:fast: no test files selected\n');
  process.exit(1);
}

const result = spawnSync('bun', ['test', ...selected], {
  cwd: ROOT,
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
