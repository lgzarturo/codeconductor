#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { join, resolve } = require('node:path');

const VALID_EVENTS = ['pre-tool', 'post-tool', 'session-start'];
const SPAWN_TIMEOUT = 10000;

const rawArgs = process.argv.slice(1);
const args = rawArgs.filter((arg) => {
  if (VALID_EVENTS.includes(arg) || arg.startsWith('-')) return true;
  return false;
});

const event = args.find((a) => VALID_EVENTS.includes(a)) || 'pre-tool';
const extra = args.filter((a) => a !== event);
const isAgy = process.argv.some((a) => a === '--format=agy') || extra.includes('--format=agy');

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
      timeout: SPAWN_TIMEOUT,
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

function tryRun(bin, runArgs) {
  try {
    const result = spawnSync(bin, runArgs, {
      cwd: projectRoot,
      stdio: 'inherit',
      windowsHide: true,
      env: process.env,
      timeout: SPAWN_TIMEOUT,
    });
    if (result.error) {
      return false;
    }
    if (result.status === 0) {
      process.exit(0);
    }
    if (!isAgy && result.status === 2) {
      process.exit(2);
    }
    return false;
  } catch {
    return false;
  }
}

function fallback() {
  if (isAgy) {
    if (event === 'post-tool' || event === 'session-start') {
      process.stdout.write('{}\n');
    } else {
      process.stdout.write('{"decision":"allow"}\n');
    }
  }
  process.exit(0);
}

try {
  const srcMain = join(projectRoot, 'src', 'cli', 'main.ts');
  if (existsSync(srcMain) && canRun('bun')) {
    tryRun('bun', ['run', srcMain, 'hook', event, ...extra]);
  }

  const packaged = join(projectRoot, 'node_modules', 'cc-codeconductor', 'dist', 'index.js');
  if (existsSync(packaged)) {
    tryRun(process.execPath, [packaged, 'hook', event, ...extra]);
  }

  const localDist = join(projectRoot, 'dist', 'index.js');
  if (existsSync(localDist)) {
    tryRun(process.execPath, [localDist, 'hook', event, ...extra]);
  }

  tryRun('npx', ['--no-install', 'cc-codeconductor', 'hook', event, ...extra]);
} catch {
  // Ignore errors in runner attempts
}

fallback();

