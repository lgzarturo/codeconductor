#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const { existsSync, readFileSync, realpathSync } = require('node:fs');
const { delimiter, join, resolve } = require('node:path');

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
    process.env.CLAUDE_PROJECT_DIR,
    process.env.WORKSPACE_DIR,
    process.cwd(),
    resolve(__dirname, '..', '..'),
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
// Buffer once: each fallback attempt must receive the same host payload.
const input = process.stdin.isTTY ? '' : readFileSync(0, 'utf8');

/**
 * Run one candidate runner. Stdout/stderr are captured (not inherited) so a
 * candidate that writes partial output before failing can never leak onto
 * this process's real stdout ahead of a later candidate's output or the
 * fallback JSON — every event this process ever emits on stdout must be a
 * single clean document. Stderr is diagnostic-only and safe to relay
 * unconditionally; stdout is only ever relayed on the two branches that
 * immediately exit, so nothing else can write to stdout afterward.
 */
function tryRun(bin, runArgs) {
  try {
    const result = spawnSync(bin, runArgs, {
      cwd: projectRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
      input,
      windowsHide: true,
      env: process.env,
      encoding: 'utf8',
      timeout: SPAWN_TIMEOUT,
    });
    if (result.error) {
      return false;
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
    if (result.status === 0) {
      if (result.stdout) process.stdout.write(result.stdout);
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
  // spawnSync('bun', ['--version']) as a pre-check before every real attempt
  // used to cost a second subprocess on every single hook invocation. A
  // missing/unrunnable 'bun' already surfaces as `result.error` inside
  // tryRun(), so the pre-check is redundant — dropping it halves the spawn
  // count (and the worst-case latency) for the common case where bun exists.
  const srcMain = join(projectRoot, 'src', 'cli', 'main.ts');
  if (existsSync(srcMain)) {
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

  // Locate global npm installs without invoking npx or Windows .cmd shims.
  for (const binDir of (process.env.PATH || '').split(delimiter).filter(Boolean)) {
    const candidates = [
      join(binDir, 'node_modules', 'cc-codeconductor', 'dist', 'index.js'),
      join(binDir, '..', 'lib', 'node_modules', 'cc-codeconductor', 'dist', 'index.js'),
    ];
    const executable = join(binDir, 'cc-codeconductor');
    if (existsSync(executable)) candidates.push(realpathSync(executable));
    for (const candidate of candidates) {
      if (existsSync(candidate)) tryRun(process.execPath, [candidate, 'hook', event, ...extra]);
    }
  }
} catch {
  // Ignore errors in runner attempts
}

fallback();
