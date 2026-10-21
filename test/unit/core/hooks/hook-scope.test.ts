import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { parseArgs, routeCommand } from '../../../../src/cli/router';
import { hookCommand } from '../../../../src/commands/hook.command';
import {
  evaluatePreTool,
  evaluateScopeAccess,
} from '../../../../src/core/hooks/hook-runner';

const ROOT = resolve(import.meta.dir, '../../../..');

describe('core/hooks/hook-runner scope-deny', () => {
  test('allows a file inside the declared scope', () => {
    expect(evaluateScopeAccess('src/api/router.ts', ['src/api']).allowed).toBe(true);
  });

  test('denies a file outside the declared scope with a scope reason', () => {
    const result = evaluateScopeAccess('src/auth/login.ts', ['src/api']);
    expect(result.allowed).toBe(false);
    expect(result.reason ?? '').toMatch(/scope/i);
  });

  test('empty scope is fail-open (no restriction configured)', () => {
    expect(evaluateScopeAccess('src/auth/login.ts', []).allowed).toBe(true);
  });

  test('tolerates ** glob markers like the scorecard scope audit', () => {
    expect(evaluateScopeAccess('src/api/router.ts', ['src/api/**']).allowed).toBe(true);
    expect(evaluateScopeAccess('src/auth/login.ts', ['src/api/**']).allowed).toBe(false);
  });

  test('evaluatePreTool denies out-of-scope files deny-first', () => {
    const verdict = evaluatePreTool({ filePath: 'src/auth/login.ts', scopeFiles: ['src/api'] });
    expect(verdict.action).toBe('deny');
    expect(verdict.message).toMatch(/scope/i);
  });

  test('evaluatePreTool allows in-scope files through to the normal checks', () => {
    const verdict = evaluatePreTool({ filePath: 'src/api/router.ts', scopeFiles: ['src/api'] });
    expect(verdict.action).toBe('allow');
  });

  test('hook pre-tool blocks out-of-scope writes via scopeFiles', async () => {
    const result = await hookCommand({
      event: 'pre-tool',
      projectRoot: process.cwd(),
      output: 'json',
      filePath: 'src/auth/login.ts',
      scopeFiles: ['src/api'],
      stdinText: '',
    });
    expect(result.data).toMatchObject({ success: false });
    expect(result.code).toBe(2);
  });

  test('scope matching is Windows-path aware like role access', () => {
    expect(evaluateScopeAccess('C:\\project\\src\\api\\router.ts', ['src/api']).allowed).toBe(true);
    expect(evaluateScopeAccess('C:\\project\\src\\auth\\login.ts', ['src/api']).allowed).toBe(false);
  });

  test('router --scope flag wires scope-deny into hook pre-tool', async () => {
    const denied = await routeCommand(
      parseArgs(['hook', 'pre-tool', '--file', 'src/auth/login.ts', '--scope', 'src/api']),
      ROOT,
    );
    expect(denied.code).toBe(2);
    expect(denied.data).toMatchObject({ success: false });
    const allowed = await routeCommand(
      parseArgs(['hook', 'pre-tool', '--file', 'src/api/router.ts', '--scope', 'src/api']),
      ROOT,
    );
    expect(allowed.code).toBe(0);
    expect(allowed.data).toMatchObject({ success: true });
  });
});
