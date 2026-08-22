/**
 * Integration tests for BC-006 — openspec validate functionality
 * 
 * Acceptance Criterion 3:
 * `cc openspec validate` confirma ausencia de ciclos y dependencias desconocidas sobre el BACKLOG.md actual del repo
 * 
 * These tests verify that the command runs successfully and detects:
 * - Dependency cycles (detectCycle in backlog-validator.ts)
 * - Unknown dependencies (UNKNOWN_DEPENDENCY error code)
 */

import { describe, expect, test } from 'bun:test';
import { spawn } from 'bun';
import { resolve } from 'node:path';

const PROJECT_ROOT = process.cwd();

/**
 * Run `bun run src/cli/main.ts openspec validate --output json` and parse the output
 */
async function runOpenspecValidate(): Promise<{
  success: boolean;
  valid: boolean;
  errors: string[];
  recommendations: string[];
  itemCount: number;
  archiveCount: number;
}> {
  const proc = spawn({
    cmd: ['bun', 'run', 'src/cli/main.ts', 'openspec', 'validate', '--output', 'json'],
    cwd: PROJECT_ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const output = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new Error(`openspec validate exited with code ${exitCode}: ${output}`);
  }

  return JSON.parse(output);
}

describe('openspec validate integration', () => {
  test('should validate the current BACKLOG.md without errors', async () => {
    // Happy path: the repo's BACKLOG.md should be valid
    const result = await runOpenspecValidate();

    expect(result.success).toBe(true, 'openspec validate should report success');
    expect(result.valid).toBe(true, 'openspec validate should report valid: true');
    expect(result.errors).toEqual([], 'openspec validate should report zero errors');
  });

  test('should report no dependency cycles in BACKLOG.md', async () => {
    // Edge case: confirm absence of cycles explicitly
    const result = await runOpenspecValidate();

    const hasCycleError = result.errors.some((err) => /cycle|circular/i.test(err));
    expect(hasCycleError).toBe(false, 'BACKLOG.md should not contain dependency cycles');
  });

  test('should report no unknown dependencies in BACKLOG.md', async () => {
    // Edge case: confirm absence of unknown dependencies
    const result = await runOpenspecValidate();

    const hasUnknownDepError = result.errors.some((err) => /unknown|not.{0,30}found|does.{0,30}not.{0,30}exist/i.test(err));
    expect(hasUnknownDepError).toBe(false, 'BACKLOG.md should not reference unknown BC-NNN IDs in Depends on');
  });

  test('should report item count and archive count in BACKLOG.md', async () => {
    // Edge case: validate metadata about the backlog
    const result = await runOpenspecValidate();

    expect(typeof result.itemCount).toBe('number', 'result should include itemCount');
    expect(result.itemCount).toBeGreaterThanOrEqual(0, 'itemCount should be non-negative');
    expect(typeof result.archiveCount).toBe('number', 'result should include archiveCount');
    expect(result.archiveCount).toBeGreaterThanOrEqual(0, 'archiveCount should be non-negative');
  });

  test('should exit with code 0 on valid BACKLOG.md', async () => {
    // Happy path: verify the process exit code matches success
    const proc = spawn({
      cmd: ['bun', 'run', 'src/cli/main.ts', 'openspec', 'validate', '--output', 'json'],
      cwd: PROJECT_ROOT,
    });

    const exitCode = await proc.exited;
    expect(exitCode).toBe(0, 'openspec validate should exit with code 0 on success');
  });
});
