#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { join } = require('node:path');

const event = process.argv[2] || 'pre-tool';
const extra = process.argv.slice(3);
const cwd = process.cwd();

function canRun(bin) {
  const result = spawnSync(bin, ['--version'], {
    encoding: 'utf8',
    windowsHide: true,
    stdio: 'ignore',
  });
  return result.status === 0;
}

function run(bin, args) {
  const result = spawnSync(bin, args, {
    cwd,
    stdio: 'inherit',
    windowsHide: true,
    env: process.env,
  });
  process.exit(result.status === null ? 1 : result.status);
}

const srcMain = join(cwd, 'src', 'cli', 'main.ts');
if (existsSync(srcMain) && canRun('bun')) {
  run('bun', ['run', srcMain, 'hook', event, ...extra]);
}

const packaged = join(cwd, 'node_modules', 'cc-codeconductor', 'dist', 'index.js');
if (existsSync(packaged)) {
  run(process.execPath, [packaged, 'hook', event, ...extra]);
}

const localDist = join(cwd, 'dist', 'index.js');
if (existsSync(localDist)) {
  run(process.execPath, [localDist, 'hook', event, ...extra]);
}

run('npx', ['--no-install', 'cc-codeconductor', 'hook', event, ...extra]);
