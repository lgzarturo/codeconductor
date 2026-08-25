/**
 * Tests for shell-free regression checklist command execution (TC1/W2).
 *
 * Checklist commands run via tokenized execFile, never a shell, so shell
 * metacharacters in a configured command are inert argv entries.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCheckCommand } from '../src/core/evaluation/regression-checklist';

let projectRoot: string;

beforeEach(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), 'cc-regression-'));
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

describe('runCheckCommand: shell-free execution', () => {
  test('a passing command reports success', () => {
    const outcome = runCheckCommand('node -e "process.exit(0)"', projectRoot);
    expect(outcome.passed).toBe(true);
  });

  test('a failing command reports failure', () => {
    const outcome = runCheckCommand('node -e "process.exit(1)"', projectRoot);
    expect(outcome.passed).toBe(false);
  });

  test('shell metacharacters are not interpreted (no command injection)', () => {
    const pwned = join(projectRoot, 'pwned.txt');
    const outcome = runCheckCommand(`node -e "process.exit(0)" && touch ${pwned}`, projectRoot);

    // With a shell, `touch` would have run. Tokenized, `&&`, `touch` and the
    // path are literal argv entries for node, which exits 0 regardless.
    expect(outcome.passed).toBe(true);
    expect(existsSync(pwned)).toBe(false);
  });

  test('an empty command fails without spawning', () => {
    const outcome = runCheckCommand('   ', projectRoot);
    expect(outcome.passed).toBe(false);
    expect(outcome.message).toBe('Empty command');
  });
});
