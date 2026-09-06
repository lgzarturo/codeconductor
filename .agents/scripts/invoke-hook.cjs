#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { join, resolve } = require('node:path');

const event = process.argv[2] || 'pre-tool';
const extra = process.argv.slice(3);
const isAgy = extra.includes('--format=agy');

function findProjectRoot() {
  const candidates = [
    process.env.PROJECT_ROOT,
    process.env.WORKSPACE_DIR,
    resolve(__dirname, '..', '..'),
    process.cwd(),
  ].filter(Boolean);

  for (const dir of candidates) {
    if (
      existsSync(join(dir, 'package.json')) ||
      existsSync(join(dir, '.git')) ||
      existsSync(join(dir, '.agents')) ||
      existsSync(join(dir, '.claude'))
    ) {
      return dir;
    }
  }
  return resolve(__dirname, '..', '..');
}

const projectRoot = findProjectRoot();

function canRun(bin) {
  try {
    const result = spawnSync(bin, ['--version'], {
      encoding: 'utf8',
      windowsHide: true,
      stdio: 'ignore',
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

function run(bin, args) {
  const result = spawnSync(bin, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    windowsHide: true,
    env: process.env,
  });
  if (result.error) {
    return false;
  }
  if (isAgy && result.status !== 0) {
    return false;
  }
  process.exit(result.status === null ? 1 : result.status);
}

function fallbackAgy() {
  if (event === 'post-tool') {
    process.stdout.write('{}\n');
  } else if (event === 'pre-tool') {
    process.stdout.write('{"action":"allow"}\n');
  }
  process.exit(0);
}

try {
  const srcMain = join(projectRoot, 'src', 'cli', 'main.ts');
  if (existsSync(srcMain) && canRun('bun')) {
    run('bun', ['run', srcMain, 'hook', event, ...extra]);
  }

  const packaged = join(projectRoot, 'node_modules', 'cc-codeconductor', 'dist', 'index.js');
  if (existsSync(packaged)) {
    run(process.execPath, [packaged, 'hook', event, ...extra]);
  }

  const localDist = join(projectRoot, 'dist', 'index.js');
  if (existsSync(localDist)) {
    run(process.execPath, [localDist, 'hook', event, ...extra]);
  }

  if (!run('npx', ['--no-install', 'cc-codeconductor', 'hook', event, ...extra])) {
    if (isAgy) {
      fallbackAgy();
    }
    process.exit(1);
  }
} catch {
  if (isAgy) {
    fallbackAgy();
  }
  process.exit(1);
}
