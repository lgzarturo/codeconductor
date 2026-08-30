import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import packageJson from '../../../package.json';
import { evaluateCommand } from '../hooks/hook-runner';
import { appendOutcome, generateEvalId } from './outcome-store';
import { loadHarnessSuite } from './harness-experiment';
import type { HarnessSuiteTaskInput } from '../../validation/schemas';

export interface SuiteTaskResult {
  readonly id: string;
  readonly passed: boolean;
  readonly detail: string;
  readonly durationMs: number;
}

export interface SuiteRunResult {
  readonly suiteId: string;
  readonly passed: number;
  readonly failed: number;
  readonly results: readonly SuiteTaskResult[];
}

export async function runHarnessSuiteTasks(
  projectRoot: string,
  suiteId: string,
  suitePath?: string
): Promise<SuiteRunResult> {
  const suite = await loadHarnessSuite(projectRoot, suiteId, suitePath);
  if (!suite.success) {
    throw suite.error;
  }

  const results: SuiteTaskResult[] = [];
  for (const task of suite.data.tasks) {
    const started = Date.now();
    const check = runTaskCommand(projectRoot, task);
    const durationMs = Date.now() - started;
    const passed = check.ok;
    results.push({
      id: task.id,
      passed,
      detail: check.detail,
      durationMs,
    });

    await appendOutcome(projectRoot, {
      id: generateEvalId('out'),
      taskId: task.id,
      source: 'pipeline',
      agent: 'evaluation',
      model: 'suite-run',
      contractVersion: packageJson.version,
      timestamp: new Date().toISOString(),
      status: passed ? 'pass' : 'reject',
      verdict: passed ? 'PASS' : 'REJECT',
      weightedScore: passed ? 3 : 0,
      suiteTaskId: task.id,
      durationMs,
    });
  }

  return {
    suiteId: suite.data.id,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    results,
  };
}

function runTaskCommand(
  projectRoot: string,
  task: HarnessSuiteTaskInput
): { ok: boolean; detail: string } {
  const raw = task.testCommand?.trim() ?? '';
  if (!raw) {
    return { ok: false, detail: 'Missing testCommand' };
  }

  const hookMatch = raw.match(/^hook:(deny|allow)\s+(.+)$/s);
  if (hookMatch) {
    const expectDeny = hookMatch[1] === 'deny';
    const verdict = evaluateCommand(hookMatch[2]);
    const denied = verdict.action === 'deny';
    const ok = expectDeny ? denied : !denied;
    return {
      ok,
      detail: ok
        ? `${hookMatch[1]} ${hookMatch[2]}`
        : `expected ${hookMatch[1]}, got ${verdict.action}: ${verdict.message}`,
    };
  }

  const parts = tokenize(raw);
  if (parts.length === 0) {
    return { ok: false, detail: 'Empty testCommand' };
  }

  const bin = parts[0] === 'bun' && existsSync(resolve(projectRoot, 'src/cli/main.ts'))
    ? 'bun'
    : parts[0];
  const args = parts[0] === 'bun' ? parts.slice(1) : parts.slice(1);
  const result = spawnSync(bin, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 60_000,
  });
  const ok = result.status === 0;
  return {
    ok,
    detail: ok
      ? raw
      : (result.stderr || result.stdout || `exit ${result.status}`).slice(0, 400),
  };
}

function tokenize(command: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  for (const ch of command) {
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) tokens.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current) tokens.push(current);
  return tokens;
}
