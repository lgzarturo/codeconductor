/**
 * Live Claude Code host for cheap bench cells (OpenRouter :free).
 * Spawns `claude -p --output-format json` in a clean fixture workdir.
 */
import { spawn } from 'node:child_process';
import { cp, mkdtemp, rm, writeFile, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectClaudeJson } from '../../telemetry/collectors/claude-json';
import type { BenchRunCell } from './report';

export interface ClaudeHostSlot {
  taskId: string;
  variant: 'baseline' | 'treatment';
  repetition: number;
  prompt: string;
  testCommand?: string;
}

export interface ClaudeHostOptions {
  fixtureDir: string;
  modelId: string;
  /** Claude Code binary (default: claude). */
  claudeBin?: string;
  /** Per-cell timeout ms (default 5 min). */
  timeoutMs?: number;
  /** Minimum ms between Claude invocations (default 3000 ≈ 20/min). */
  minIntervalMs?: number;
  hostVersion?: string | null;
  /** Called before each spawn (rate-limit / abort hooks). */
  beforeCall?: () => Promise<void> | void;
}

export interface ClaudeHostCellResult {
  cell: BenchRunCell | null;
  pending: boolean;
  pendingReason: string | null;
  durationMs: number;
  /** Sanitized totals only — never raw host JSON / session ids. */
  totals: {
    input: number | null;
    output: number | null;
    cacheRead: number | null;
    cacheWrite: number | null;
    costUsd: number | null;
  } | null;
}

let lastCallAt = 0;

async function rateLimit(minIntervalMs: number): Promise<void> {
  const now = Date.now();
  const wait = lastCallAt + minIntervalMs - now;
  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait));
  }
  lastCallAt = Date.now();
}

function runShell(
  command: string,
  cwd: string,
  timeoutMs: number,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('bash', ['-lc', command], {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString('utf8');
    });
    child.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString('utf8');
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: 1, stdout, stderr: String(err) });
    });
  });
}

/**
 * Run one bench cell via Claude Code headless. Does not print secrets.
 */
export async function runClaudeHostCell(
  slot: ClaudeHostSlot,
  options: ClaudeHostOptions,
): Promise<ClaudeHostCellResult> {
  const timeoutMs = options.timeoutMs ?? 300_000;
  const minIntervalMs = options.minIntervalMs ?? 3_000;
  const claudeBin = options.claudeBin ?? 'claude';
  const started = Date.now();

  let workDir: string | null = null;
  try {
    await options.beforeCall?.();
    await rateLimit(minIntervalMs);

    workDir = await mkdtemp(join(tmpdir(), 'cc-bench-live-'));
    await cp(options.fixtureDir, join(workDir, 'fixture'), { recursive: true });
    const cwd = join(workDir, 'fixture');

    // Prompt file avoids shell-escaping issues; never logged.
    const promptPath = join(workDir, 'prompt.txt');
    await writeFile(promptPath, slot.prompt, 'utf-8');

    const modelFlag = options.modelId ? `--model ${JSON.stringify(options.modelId)}` : '';
    // Non-interactive CI: skip permissions. Output JSON only.
    const cmd = [
      claudeBin,
      '-p',
      `"$(cat ${JSON.stringify(promptPath)})"`,
      '--output-format json',
      '--dangerously-skip-permissions',
      modelFlag,
    ]
      .filter(Boolean)
      .join(' ');

    const result = await runShell(cmd, cwd, timeoutMs);
    const durationMs = Date.now() - started;

    if (result.code !== 0 && !result.stdout.trim()) {
      return {
        cell: null,
        pending: true,
        pendingReason: `claude exit ${result.code}`,
        durationMs,
        totals: null,
      };
    }

    let payload: unknown;
    try {
      payload = JSON.parse(result.stdout);
    } catch {
      // Some hosts wrap JSON; try last {...} block.
      const m = result.stdout.match(/\{[\s\S]*\}\s*$/);
      if (!m) {
        return {
          cell: null,
          pending: true,
          pendingReason: 'claude stdout was not JSON',
          durationMs,
          totals: null,
        };
      }
      try {
        payload = JSON.parse(m[0]!);
      } catch {
        return {
          cell: null,
          pending: true,
          pendingReason: 'claude stdout JSON parse failed',
          durationMs,
          totals: null,
        };
      }
    }

    const collected = collectClaudeJson(payload, {
      runId: `bench-${slot.taskId}-${slot.variant}-${slot.repetition}`,
      taskId: slot.taskId,
      hostVersion: options.hostVersion ?? null,
      privacy: 'strict',
    });

    let success = false;
    if (slot.testCommand?.trim()) {
      // Promote *.example tests when present (harness-v1 convention).
      for (const name of ['math', 'greet', 'review-target']) {
        const example = join(cwd, 'src', `${name}.test.ts.example`);
        const dest = join(cwd, 'src', `${name}.test.ts`);
        try {
          await access(example);
          const body = await readFile(example, 'utf-8');
          await writeFile(dest, body, 'utf-8');
        } catch {
          // ignore missing examples
        }
      }
      const test = await runShell(slot.testCommand, cwd, 60_000);
      success = test.code === 0;
    } else {
      success = result.code === 0;
    }

    const input = collected.totals.input;
    const output = collected.totals.output;
    const cacheRead = collected.totals.cacheRead;
    const cacheWrite = collected.totals.cacheWrite;
    const tokensTotal =
      (input ?? 0) + (output ?? 0) + (cacheRead ?? 0) + (cacheWrite ?? 0);

    const cell: BenchRunCell = {
      taskId: slot.taskId,
      variant: slot.variant,
      repetition: slot.repetition,
      success,
      iterations: 1,
      retries: 0,
      calls: 1,
      tokensTotal: tokensTotal > 0 ? tokensTotal : null,
      tokensInput: input,
      tokensOutput: output,
      tokensCacheRead: cacheRead,
      tokensCacheWrite: cacheWrite,
      costUsd: collected.totals.costUsd,
      durationMs,
      cacheHitRate:
        input && cacheRead && input > 0 ? cacheRead / (input + cacheRead) : null,
      firstTry: success,
      modelId: options.modelId,
      hostVersion: options.hostVersion ?? null,
    };

    return {
      cell,
      pending: false,
      pendingReason: null,
      durationMs,
      totals: {
        input,
        output,
        cacheRead,
        cacheWrite,
        costUsd: collected.totals.costUsd,
      },
    };
  } catch (err) {
    return {
      cell: null,
      pending: true,
      pendingReason: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - started,
      totals: null,
    };
  } finally {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
