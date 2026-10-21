import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { parseArgs, routeCommand } from '../../../../src/cli/router';
import { hookCommand } from '../../../../src/commands/hook.command';
import {
  evaluateDispatchMode,
  evaluateLeafTaskAccess,
  evaluatePreTool,
  isDispatchMode,
} from '../../../../src/core/hooks/hook-runner';

const ROOT = resolve(import.meta.dir, '../../../..');

describe('core/hooks/hook-runner dispatch modes', () => {
  test('full: production writes allowed, test writes denied', () => {
    expect(evaluateDispatchMode('full', { filePath: 'src/api/a.ts' }).allowed).toBe(true);
    expect(evaluateDispatchMode('full', { filePath: 'src/api/a.test.ts' }).allowed).toBe(false);
  });

  test('test-add: only test files writable', () => {
    expect(evaluateDispatchMode('test-add', { filePath: 'test/a.test.ts' }).allowed).toBe(true);
    const denied = evaluateDispatchMode('test-add', { filePath: 'src/api/a.ts' });
    expect(denied.allowed).toBe(false);
    expect(denied.reason ?? '').toMatch(/test-add/);
  });

  test('dep-bump: only manifests and lockfiles writable', () => {
    for (const file of ['package.json', 'bun.lock', 'Cargo.toml', 'go.mod']) {
      expect(evaluateDispatchMode('dep-bump', { filePath: file }).allowed).toBe(true);
    }
    expect(evaluateDispatchMode('dep-bump', { filePath: 'src/api/a.ts' }).allowed).toBe(false);
  });

  test('scaffold: only new files writable, fail-closed on unknown existence', () => {
    expect(evaluateDispatchMode('scaffold', { filePath: 'src/new.ts', exists: false }).allowed).toBe(true);
    expect(evaluateDispatchMode('scaffold', { filePath: 'src/a.ts', exists: true }).allowed).toBe(false);
    expect(evaluateDispatchMode('scaffold', { filePath: 'src/a.ts' }).allowed).toBe(false);
  });

  test('rename-move: file writes denied, only git mv commands allowed', () => {
    expect(evaluateDispatchMode('rename-move', { filePath: 'src/a.ts' }).allowed).toBe(false);
    expect(evaluateDispatchMode('rename-move', { command: 'git mv a.ts b.ts' }).allowed).toBe(true);
    expect(evaluateDispatchMode('rename-move', { command: 'rm a.ts' }).allowed).toBe(false);
  });

  test('refactor-only: existing files only, including tests', () => {
    expect(evaluateDispatchMode('refactor-only', { filePath: 'src/a.ts', exists: true }).allowed).toBe(true);
    expect(evaluateDispatchMode('refactor-only', { filePath: 'test/a.test.ts', exists: true }).allowed).toBe(true);
    expect(evaluateDispatchMode('refactor-only', { filePath: 'src/new.ts', exists: false }).allowed).toBe(false);
    expect(evaluateDispatchMode('refactor-only', { filePath: 'src/a.ts' }).allowed).toBe(false);
  });

  test('surgical-fix: in-scope existing non-test files, scope required', () => {
    const scope = ['src/api'];
    expect(
      evaluateDispatchMode('surgical-fix', { filePath: 'src/api/a.ts', scopeFiles: scope, exists: true }).allowed,
    ).toBe(true);
    expect(
      evaluateDispatchMode('surgical-fix', { filePath: 'src/auth/a.ts', scopeFiles: scope, exists: true }).allowed,
    ).toBe(false);
    expect(
      evaluateDispatchMode('surgical-fix', { filePath: 'src/api/a.test.ts', scopeFiles: scope, exists: true }).allowed,
    ).toBe(false);
    expect(
      evaluateDispatchMode('surgical-fix', { filePath: 'src/api/new.ts', scopeFiles: scope, exists: false }).allowed,
    ).toBe(false);
    expect(evaluateDispatchMode('surgical-fix', { filePath: 'src/api/a.ts', exists: true }).allowed).toBe(false);
  });

  test('isDispatchMode validates the 7 known modes', () => {
    for (const mode of ['full', 'surgical-fix', 'refactor-only', 'test-add', 'scaffold', 'rename-move', 'dep-bump']) {
      expect(isDispatchMode(mode)).toBe(true);
    }
    expect(isDispatchMode('yolo')).toBe(false);
    expect(isDispatchMode(undefined)).toBe(false);
  });

  test('leaf task-deny: delegation tools denied, work tools allowed', () => {
    expect(evaluateLeafTaskAccess('Task').allowed).toBe(false);
    expect(evaluateLeafTaskAccess('Subagent').allowed).toBe(false);
    expect(evaluateLeafTaskAccess('Edit').allowed).toBe(true);
    expect(evaluateLeafTaskAccess(undefined).allowed).toBe(true);
  });

  test('evaluatePreTool enforces dispatch mode and leaf-deny', () => {
    expect(
      evaluatePreTool({ filePath: 'src/api/a.ts', dispatchMode: 'test-add' }).action,
    ).toBe('deny');
    expect(
      evaluatePreTool({ filePath: 'src/api/a.ts', toolName: 'Task', leaf: true }).action,
    ).toBe('deny');
    expect(
      evaluatePreTool({ filePath: 'src/api/a.ts', toolName: 'Task' }).action,
    ).toBe('allow');
  });

  test('hook pre-tool resolves existence for scaffold mode', async () => {
    const denied = await hookCommand({
      event: 'pre-tool',
      projectRoot: ROOT,
      output: 'json',
      filePath: 'package.json',
      scopeFiles: undefined,
      dispatchMode: 'scaffold',
      stdinText: '',
    });
    expect(denied.code).toBe(2);
    const allowed = await hookCommand({
      event: 'pre-tool',
      projectRoot: ROOT,
      output: 'json',
      filePath: 'src/does-not-exist-xyz.ts',
      dispatchMode: 'scaffold',
      stdinText: '',
    });
    expect(allowed.code).toBe(0);
  });

  test('hook pre-tool denies Task payloads for leaf agents', async () => {
    const stdinText = JSON.stringify({ tool_name: 'Task', tool_input: { description: 'delegate' } });
    const result = await hookCommand({
      event: 'pre-tool',
      projectRoot: ROOT,
      output: 'json',
      leaf: true,
      stdinText,
    });
    expect(result.code).toBe(2);
    expect(result.data).toMatchObject({ success: false });
  });

  test('router --dispatch flag wires modes into hook pre-tool', async () => {
    const denied = await routeCommand(
      parseArgs(['hook', 'pre-tool', '--file', 'src/api/a.ts', '--dispatch', 'test-add']),
      ROOT,
    );
    expect(denied.code).toBe(2);
    const allowed = await routeCommand(
      parseArgs(['hook', 'pre-tool', '--file', 'test/a.test.ts', '--dispatch', 'test-add']),
      ROOT,
    );
    expect(allowed.code).toBe(0);
  });

  test('router rejects unknown dispatch modes', async () => {
    const result = await routeCommand(
      parseArgs(['hook', 'pre-tool', '--file', 'src/a.ts', '--dispatch', 'yolo']),
      ROOT,
    );
    expect(result.code).toBe(1);
  });
});
