#!/usr/bin/env bun
/**
 * Build CLI binary (dist/index.js) and library bundle + declaration files.
 */
import { spawnSync } from 'node:child_process';

function run(label: string, args: string[]): void {
  const result = spawnSync('bun', args, { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit ${result.status ?? 'unknown'}`);
  }
}

run('cli bundle', [
  'build',
  'src/cli/main.ts',
  '--target=node',
  '--outfile=dist/index.js',
]);

run('library bundle', [
  'build',
  'src/index.ts',
  '--target=node',
  '--outfile=dist/library.js',
  '--packages=external',
]);

const types = spawnSync('bunx', ['tsc', '-p', 'tsconfig.lib.json', '--emitDeclarationOnly'], {
  stdio: 'inherit',
});
if (types.status !== 0) {
  throw new Error(`library types failed with exit ${types.status ?? 'unknown'}`);
}

console.log('Built dist/index.js (CLI), dist/library.js, and declaration files.');
