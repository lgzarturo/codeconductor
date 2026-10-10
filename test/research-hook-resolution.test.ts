import { afterEach, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const hook = resolve('presets/shared/invoke-hook.cjs');
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'cc-trusted-hook-'));
  roots.push(root);
  writeFileSync(join(root, 'package.json'), '{}');
  return root;
}
function invoke(root: string, args: string[], env: Record<string, string> = {}) {
  return spawnSync(process.execPath, [hook, ...args], { cwd: root, input: '{}', encoding: 'utf8', env: { ...process.env, PROJECT_ROOT: root, CC_DEV: '0', CC_HOOK_FAIL_CLOSED: '0', PATH: '', ...env } });
}

test('hook does not execute consumer source or consumer dist as CodeConductor', () => {
  const root = fixture();
  for (const file of ['src/cli/main.ts', 'dist/index.js']) {
    mkdirSync(join(root, file, '..'), { recursive: true });
    writeFileSync(join(root, file), `require('node:fs').writeFileSync(${JSON.stringify(join(root, 'executed'))}, 'yes');`);
  }
  const result = invoke(root, ['pre-tool']);
  expect(result.status).toBe(0);
  expect(existsSync(join(root, 'executed'))).toBe(false);
});

test('pre-tool fails closed when runner is absent for Claude and Agy', () => {
  const root = fixture();
  const claude = invoke(root, ['pre-tool'], { CC_HOOK_FAIL_CLOSED: '1' });
  expect(claude.status).toBe(2);
  expect(claude.stderr).toContain('unavailable');
  const agy = invoke(root, ['pre-tool', '--format=agy'], { CC_HOOK_FAIL_CLOSED: '1' });
  expect(agy.status).toBe(0);
  expect(JSON.parse(agy.stdout).decision).toBe('deny');
});

test('installed runner failure denies cleanly and session-start reports an unavailable guard', () => {
  const root = fixture();
  mkdirSync(join(root, 'node_modules/cc-codeconductor/dist'), { recursive: true });
  writeFileSync(join(root, 'node_modules/cc-codeconductor/dist/index.js'), "process.stdout.write('partial');process.exit(1);");
  const denied = invoke(root, ['pre-tool', '--format=agy'], { CC_HOOK_FAIL_CLOSED: '1' });
  expect(JSON.parse(denied.stdout).decision).toBe('deny');
  const session = invoke(root, ['session-start', '--format=agy']);
  expect(session.status).toBe(0);
  expect(session.stderr).toContain('guard unavailable');
  expect(JSON.parse(session.stdout)).toEqual({});
});

test('doctor can probe installed hook runner without a tool invocation', () => {
  const root = fixture();
  expect(JSON.parse(invoke(root, ['--check']).stdout)).toEqual({ operational: false, failClosed: false });
  mkdirSync(join(root, 'node_modules/cc-codeconductor/dist'), { recursive: true });
  writeFileSync(join(root, 'node_modules/cc-codeconductor/dist/index.js'), "process.stdout.write('help');");
  expect(JSON.parse(invoke(root, ['--check']).stdout)).toEqual({ operational: true, failClosed: false });
});
