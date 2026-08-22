/**
 * Tests for PreToolUse git-guardrail hook.
 *
 * The hook intercepts git push, reset --hard, clean -f, branch -D,
 * and checkout/restore with discard flags, blocking them with exit code 2.
 *
 * NOTE: This is TDD — tests are written BEFORE the implementation is complete.
 * New git pattern tests will FAIL until BC-009-implement adds the patterns
 * to presets/claude/settings.json. The existing sensible-file-read test
 * should PASS as regression smoke test.
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dir, '..');
const SETTINGS_PATH = join(PROJECT_ROOT, 'presets/claude/settings.json');

interface HookConfig {
  matcher: string;
  hooks: Array<{
    type: string;
    command: string;
  }>;
}

let hookCommand: string;

beforeAll(async () => {
  const settingsContent = await readFile(SETTINGS_PATH, 'utf-8');
  const settings = JSON.parse(settingsContent);
  
  // Find the PreToolUse hook with Bash matcher
  const preToolUseHooks: HookConfig[] = settings.hooks.PreToolUse;
  const bashHook = preToolUseHooks.find((h) => h.matcher === 'Bash');
  
  if (!bashHook || !bashHook.hooks || bashHook.hooks.length === 0) {
    throw new Error('PreToolUse Bash hook not found in settings.json');
  }
  
  // Use the first hook command (the one that will be extended)
  hookCommand = bashHook.hooks[0].command;
});

/**
 * Helper: execute hook command with CLAUDE_TOOL_INPUT_COMMAND
 */
async function runHook(
  command: string
): Promise<{ exitCode: number; stderr: string; stdout: string }> {
  const { spawn } = await import('bun');
  const child = spawn({
    cmd: ['bash', '-c', hookCommand],
    env: {
      ...process.env,
      CLAUDE_TOOL_INPUT_COMMAND: command,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  
  const [stdout, stderr] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  const exitCode = await child.exited;
  
  return { exitCode, stderr, stdout };
}

// ─── REGRESSION: Existing sensible file read protection ────────────────────

describe('PreToolUse git-guardrail hook — Regression: sensible files', () => {
  test('should block reading .env files', async () => {
    const result = await runHook('cat .env');
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('Bloqueado');
  });

  test('should block reading id_rsa keys', async () => {
    const result = await runHook('cat ~/.ssh/id_rsa');
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('Bloqueado');
  });

  test('should block reading .pem files', async () => {
    const result = await runHook('cat ./config.pem');
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('Bloqueado');
  });

  test('should allow listing .env files (grep, not cat)', async () => {
    // grep checks but doesn't read entire file content — should pass
    const result = await runHook('grep -r API_KEY .env');
    expect(result.exitCode).toBe(0);
  });
});

// ─── HAPPY PATH: git push blocking ────────────────────────────────────────

describe('PreToolUse git-guardrail hook — git push blocking', () => {
  test('should block git push (simple)', async () => {
    const result = await runHook('git push');
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('autoridad');
  });

  test('should block git push origin main', async () => {
    const result = await runHook('git push origin main');
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('autoridad');
  });

  test('should block git push --force', async () => {
    const result = await runHook('git push --force');
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('autoridad');
  });

  test('should block git push -f', async () => {
    const result = await runHook('git push -f origin main');
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('autoridad');
  });

  test('should block git push --force-with-lease', async () => {
    const result = await runHook('git push --force-with-lease');
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('autoridad');
  });
});

// ─── HAPPY PATH: git reset --hard blocking ───────────────────────────────

describe('PreToolUse git-guardrail hook — git reset --hard blocking', () => {
  test('should block git reset --hard', async () => {
    const result = await runHook('git reset --hard');
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('autoridad');
  });

  test('should block git reset --hard HEAD', async () => {
    const result = await runHook('git reset --hard HEAD');
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('autoridad');
  });

  test('should block git reset --hard HEAD~1', async () => {
    const result = await runHook('git reset --hard HEAD~1');
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('autoridad');
  });

  test('should allow git reset --soft (non-destructive)', async () => {
    const result = await runHook('git reset --soft HEAD~1');
    expect(result.exitCode).toBe(0);
  });

  test('should allow git reset (no flag, default mixed)', async () => {
    const result = await runHook('git reset HEAD');
    expect(result.exitCode).toBe(0);
  });
});

// ─── HAPPY PATH: git clean -f blocking ────────────────────────────────────

describe('PreToolUse git-guardrail hook — git clean -f blocking', () => {
  test('should block git clean -f', async () => {
    const result = await runHook('git clean -f');
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('autoridad');
  });

  test('should block git clean -fd', async () => {
    const result = await runHook('git clean -fd');
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('autoridad');
  });

  test('should block git clean -fx', async () => {
    const result = await runHook('git clean -fx');
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('autoridad');
  });

  test('should block git clean -fdx', async () => {
    const result = await runHook('git clean -fdx');
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('autoridad');
  });

  test('should block git clean --force', async () => {
    const result = await runHook('git clean --force');
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('autoridad');
  });

  test('should allow git clean -d (without -f, dry run)', async () => {
    const result = await runHook('git clean -d');
    expect(result.exitCode).toBe(0);
  });

  test('should allow git clean -n (dry-run, no -f)', async () => {
    const result = await runHook('git clean -n');
    expect(result.exitCode).toBe(0);
  });
});

// ─── HAPPY PATH: git branch -D blocking ───────────────────────────────────

describe('PreToolUse git-guardrail hook — git branch -D blocking', () => {
  test('should block git branch -D main', async () => {
    const result = await runHook('git branch -D main');
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('autoridad');
  });

  test('should block git branch -D feature-xyz', async () => {
    const result = await runHook('git branch -D feature-xyz');
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('autoridad');
  });

  test('should block git branch --delete --force main', async () => {
    const result = await runHook('git branch --delete --force main');
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('autoridad');
  });

  test('should allow git branch -d (non-force delete, allow attempt)', async () => {
    const result = await runHook('git branch -d feature-xyz');
    expect(result.exitCode).toBe(0);
  });

  test('should allow git branch (list)', async () => {
    const result = await runHook('git branch');
    expect(result.exitCode).toBe(0);
  });

  test('should allow git branch -m (rename, non-destructive)', async () => {
    const result = await runHook('git branch -m old-name new-name');
    expect(result.exitCode).toBe(0);
  });
});

// ─── HAPPY PATH: git checkout discard blocking ────────────────────────────

describe('PreToolUse git-guardrail hook — git checkout with discard flags', () => {
  test('should block git checkout -f', async () => {
    const result = await runHook('git checkout -f');
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('autoridad');
  });

  test('should block git checkout -f -- src/file.ts', async () => {
    const result = await runHook('git checkout -f -- src/file.ts');
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('autoridad');
  });

  test('should block git checkout --force', async () => {
    const result = await runHook('git checkout --force');
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('autoridad');
  });

  test('should block git checkout --discard-changes', async () => {
    const result = await runHook('git checkout --discard-changes');
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('autoridad');
  });

  test('should block git checkout --theirs -- file.ts', async () => {
    const result = await runHook('git checkout --theirs -- file.ts');
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('autoridad');
  });

  test('should block git checkout --ours -- file.ts', async () => {
    const result = await runHook('git checkout --ours -- file.ts');
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('autoridad');
  });

  test('should block git checkout - (alias for previous branch, ambiguous discard)', async () => {
    const result = await runHook('git checkout -');
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('autoridad');
  });

  test('should allow git checkout main (branch switch, no discard flags)', async () => {
    const result = await runHook('git checkout main');
    expect(result.exitCode).toBe(0);
  });

  test('should allow git checkout -b feature-new (create branch, no discard)', async () => {
    const result = await runHook('git checkout -b feature-new');
    expect(result.exitCode).toBe(0);
  });

  test('should allow git checkout -b feature-new origin/feature-new', async () => {
    const result = await runHook('git checkout -b feature-new origin/feature-new');
    expect(result.exitCode).toBe(0);
  });

  test('should allow git checkout -- src/file.ts (unstage working tree changes, no force)', async () => {
    const result = await runHook('git checkout -- src/file.ts');
    expect(result.exitCode).toBe(0);
  });
});

// ─── HAPPY PATH: git restore discard blocking ────────────────────────────

describe('PreToolUse git-guardrail hook — git restore with discard flags', () => {
  test('should block git restore -f src/file.ts', async () => {
    const result = await runHook('git restore -f src/file.ts');
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('autoridad');
  });

  test('should block git restore --force src/file.ts', async () => {
    const result = await runHook('git restore --force src/file.ts');
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('autoridad');
  });

  test('should block git restore --discard-changes', async () => {
    const result = await runHook('git restore --discard-changes');
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('autoridad');
  });

  test('should block git restore --theirs src/file.ts', async () => {
    const result = await runHook('git restore --theirs src/file.ts');
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('autoridad');
  });

  test('should block git restore --ours src/file.ts', async () => {
    const result = await runHook('git restore --ours src/file.ts');
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('autoridad');
  });

  test('should allow git restore --staged src/file.ts (restore to staging, no working tree discard)', async () => {
    const result = await runHook('git restore --staged src/file.ts');
    expect(result.exitCode).toBe(0);
  });

  test('should allow git restore src/file.ts (restore working tree without force)', async () => {
    const result = await runHook('git restore src/file.ts');
    expect(result.exitCode).toBe(0);
  });
});

// ─── EDGE CASE: Message content verification ─────────────────────────────

describe('PreToolUse git-guardrail hook — Message content', () => {
  test('blocked message should indicate agent lacks authority', async () => {
    const result = await runHook('git push origin main');
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('autoridad');
    expect(result.stderr.toLowerCase()).toContain('agente');
  });

  test('message should be written to stderr, not stdout', async () => {
    const result = await runHook('git push origin main');
    expect(result.stderr).toContain('autoridad');
    expect(result.stdout).toBe('');
  });
});

// ─── ACCEPTANCE CRITERIA COVERAGE ──────────────────────────────────────────

describe('PreToolUse git-guardrail hook — Acceptance Criteria', () => {
  test('AC1: Hook blocks git push with exit code 2', async () => {
    const result = await runHook('git push');
    expect(result.exitCode).toBe(2);
  });

  test('AC1: Hook blocks git reset --hard with exit code 2', async () => {
    const result = await runHook('git reset --hard');
    expect(result.exitCode).toBe(2);
  });

  test('AC2: Blocked message indicates agent has no authority', async () => {
    const result = await runHook('git push origin main');
    expect(result.stderr).toContain('autoridad');
    expect(result.stderr.toLowerCase()).toContain('agente');
  });

  test('AC3: Patterns are read from settings.json (structural editability)', async () => {
    // This test verifies the hook command is read from the settings file
    // (not hardcoded), ensuring patterns are externally editable.
    expect(hookCommand).toBeTruthy();
    expect(hookCommand).toContain('CLAUDE_TOOL_INPUT_COMMAND');
  });
});
