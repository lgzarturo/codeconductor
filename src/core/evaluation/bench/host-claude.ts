/**
 * Live Claude Code host for cheap bench cells (OpenRouter :free).
 * Spawns `claude -p --output-format json` in a clean fixture workdir.
 *
 * Diagnostics are sanitized (§7): exit code, truncated stderr (no keys),
 * subtype / is_error — never session ids, prompts, or raw host JSON blobs.
 */
import { spawn } from 'node:child_process';
import { cp, mkdtemp, rm, writeFile, readFile, access, mkdir } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  collectClaudeJson,
  resolveClaudeJsonCostBasis,
} from '../../telemetry/collectors/claude-json';
import type { BenchCostBasis, BenchRunCell } from './report';

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
  /** Max attempts per cell on 429 / empty (default 2). */
  maxAttempts?: number;
  /** Called before each spawn (rate-limit / abort hooks). */
  beforeCall?: () => Promise<void> | void;
}

/** Sanitized per-invocation diagnostics (safe for artifacts). */
export interface ClaudeHostDiagnostics {
  exitCode: number | null;
  /** stderr truncated to 500 chars, secrets scrubbed. */
  stderrTruncated: string | null;
  subtype: string | null;
  isError: boolean | null;
  timedOut: boolean;
  http429: boolean;
  attempt: number;
}

export interface ClaudeHostCellResult {
  cell: BenchRunCell | null;
  pending: boolean;
  pendingReason: string | null;
  durationMs: number;
  diagnostics: ClaudeHostDiagnostics;
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

/** Scrub secrets / long blobs from stderr for artifacts. */
export function sanitizeStderr(stderr: string, maxLen = 500): string {
  let s = stderr
    .replace(/sk-or-v1-[A-Za-z0-9_-]+/g, '[REDACTED_OR_KEY]')
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, '[REDACTED_ANT_KEY]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/ANTHROPIC_AUTH_TOKEN=\S+/g, 'ANTHROPIC_AUTH_TOKEN=[REDACTED]')
    .replace(/OPENROUTER_API_KEY=\S+/g, 'OPENROUTER_API_KEY=[REDACTED]')
    .replace(/session[_-]?id["\s:=]+[A-Za-z0-9_-]+/gi, 'session_id=[REDACTED]');
  if (s.length > maxLen) s = `${s.slice(0, maxLen)}…`;
  return s;
}

function emptyDiagnostics(attempt: number): ClaudeHostDiagnostics {
  return {
    exitCode: null,
    stderrTruncated: null,
    subtype: null,
    isError: null,
    timedOut: false,
    http429: false,
    attempt,
  };
}

function extractMeta(payload: unknown): { subtype: string | null; isError: boolean | null } {
  if (!payload || typeof payload !== 'object') {
    return { subtype: null, isError: null };
  }
  const rec = payload as Record<string, unknown>;
  const subtype =
    typeof rec.subtype === 'string'
      ? rec.subtype
      : typeof (rec.result as { subtype?: string } | undefined)?.subtype === 'string'
        ? (rec.result as { subtype: string }).subtype
        : null;
  const isError =
    typeof rec.is_error === 'boolean'
      ? rec.is_error
      : typeof rec.isError === 'boolean'
        ? rec.isError
        : null;
  return { subtype, isError };
}

function looksLike429(stderr: string, stdout: string): boolean {
  const blob = `${stderr}\n${stdout}`.toLowerCase();
  return (
    blob.includes('429') ||
    blob.includes('rate limit') ||
    blob.includes('rate_limit') ||
    blob.includes('too many requests')
  );
}

function runShell(
  command: string,
  cwd: string,
  timeoutMs: number,
  env?: NodeJS.ProcessEnv,
): Promise<{ code: number; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    let timedOut = false;
    const child = spawn('bash', ['-lc', command], {
      cwd,
      env: env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      timedOut = true;
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
      resolve({ code: code ?? 1, stdout, stderr, timedOut });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: 1, stdout, stderr: String(err), timedOut });
    });
  });
}

/**
 * Ensure Claude Code has a minimal non-interactive config (no onboarding login).
 * Does not write secrets.
 */
export async function ensureClaudeCiConfig(): Promise<void> {
  const dir = join(homedir(), '.claude');
  await mkdir(dir, { recursive: true });
  const settingsPath = join(dir, 'settings.json');
  const settings = {
    // Skip first-run / trust prompts in CI.
    hasTrustDialogAccepted: true,
    hasCompletedProjectOnboarding: true,
  };
  try {
    await access(settingsPath);
  } catch {
    await writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  }
}

function buildClaudeEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    // Force non-interactive / CI-friendly behavior.
    CI: 'true',
    // Empty Anthropic key so OpenRouter AUTH_TOKEN path is used.
    ANTHROPIC_API_KEY: '',
    ANTHROPIC_BASE_URL:
      process.env.ANTHROPIC_BASE_URL || 'https://openrouter.ai/api',
  };
}

function buildClaudeCommand(
  claudeBin: string,
  promptLiteral: string,
  modelId: string,
): string {
  // Use --print/-p with explicit permissions bypass for headless CI.
  // Prompt is passed as a single-quoted shell string (caller escapes).
  const modelFlag = modelId ? ` --model ${JSON.stringify(modelId)}` : '';
  return [
    claudeBin,
    '-p',
    promptLiteral,
    '--output-format json',
    '--dangerously-skip-permissions',
    modelFlag,
  ]
    .filter(Boolean)
    .join(' ');
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * Smoke: `claude -p "di hola" --output-format json`.
 * Up to 2 attempts. Returns diagnostics only (no secrets).
 */
export async function runClaudeSmoke(
  options: {
    modelId: string;
    claudeBin?: string;
    timeoutMs?: number;
    maxAttempts?: number;
  },
): Promise<{
  ok: boolean;
  attempts: ClaudeHostDiagnostics[];
  reason: string | null;
}> {
  await ensureClaudeCiConfig();
  const maxAttempts = options.maxAttempts ?? 2;
  const timeoutMs = options.timeoutMs ?? 120_000;
  const claudeBin = options.claudeBin ?? 'claude';
  const attempts: ClaudeHostDiagnostics[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await rateLimit(3_000);
    const cmd = buildClaudeCommand(
      claudeBin,
      shellQuote('di hola'),
      options.modelId,
    );
    const result = await runShell(cmd, process.cwd(), timeoutMs, buildClaudeEnv());
    const http429 = looksLike429(result.stderr, result.stdout);
    let subtype: string | null = null;
    let isError: boolean | null = null;
    let parsedOk = false;
    try {
      const payload = JSON.parse(result.stdout);
      const meta = extractMeta(payload);
      subtype = meta.subtype;
      isError = meta.isError;
      parsedOk = true;
      // Treat result with usage / type result as success even if empty text.
      if (
        payload &&
        typeof payload === 'object' &&
        ((payload as { type?: string }).type === 'result' ||
          (payload as { modelUsage?: unknown }).modelUsage ||
          (payload as { usage?: unknown }).usage)
      ) {
        attempts.push({
          exitCode: result.code,
          stderrTruncated: sanitizeStderr(result.stderr),
          subtype,
          isError,
          timedOut: result.timedOut,
          http429,
          attempt,
        });
        if (result.code === 0 && isError !== true) {
          return { ok: true, attempts, reason: null };
        }
      }
    } catch {
      parsedOk = false;
    }

    attempts.push({
      exitCode: result.code,
      stderrTruncated: sanitizeStderr(result.stderr || result.stdout.slice(0, 200)),
      subtype,
      isError,
      timedOut: result.timedOut,
      http429,
      attempt,
    });

    if (http429 && attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 15_000));
      continue;
    }
    if (!parsedOk && attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 5_000));
      continue;
    }
  }

  const last = attempts[attempts.length - 1];
  const reason = last
    ? `smoke failed after ${attempts.length} attempts: exit=${last.exitCode} timedOut=${last.timedOut} 429=${last.http429} subtype=${last.subtype} is_error=${last.isError} stderr=${last.stderrTruncated ?? ''}`
    : 'smoke failed with no attempts';
  return { ok: false, attempts, reason };
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
  const maxAttempts = options.maxAttempts ?? 2;
  const started = Date.now();

  await ensureClaudeCiConfig();

  let workDir: string | null = null;
  let lastDiag = emptyDiagnostics(0);

  try {
    workDir = await mkdtemp(join(tmpdir(), 'cc-bench-live-'));
    await cp(options.fixtureDir, join(workDir, 'fixture'), { recursive: true });
    const cwd = join(workDir, 'fixture');
    const promptPath = join(workDir, 'prompt.txt');
    await writeFile(promptPath, slot.prompt, 'utf-8');

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await options.beforeCall?.();
      await rateLimit(minIntervalMs);

      // Read prompt via file to avoid shell length issues; quote carefully.
      const cmd = [
        claudeBin,
        '-p',
        `"$(cat ${JSON.stringify(promptPath)})"`,
        '--output-format json',
        '--dangerously-skip-permissions',
        options.modelId ? `--model ${JSON.stringify(options.modelId)}` : '',
      ]
        .filter(Boolean)
        .join(' ');

      const result = await runShell(cmd, cwd, timeoutMs, buildClaudeEnv());
      const http429 = looksLike429(result.stderr, result.stdout);
      let payload: unknown = null;
      let subtype: string | null = null;
      let isError: boolean | null = null;

      try {
        payload = JSON.parse(result.stdout);
      } catch {
        const m = result.stdout.match(/\{[\s\S]*\}\s*$/);
        if (m) {
          try {
            payload = JSON.parse(m[0]!);
          } catch {
            payload = null;
          }
        }
      }
      if (payload) {
        const meta = extractMeta(payload);
        subtype = meta.subtype;
        isError = meta.isError;
      }

      lastDiag = {
        exitCode: result.code,
        stderrTruncated: sanitizeStderr(result.stderr),
        subtype,
        isError,
        timedOut: result.timedOut,
        http429,
        attempt,
      };

      if (http429 && attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 15_000));
        continue;
      }

      if (!payload || isError === true) {
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 5_000));
          continue;
        }
        return {
          cell: null,
          pending: true,
          pendingReason: `claude no valid cell: exit=${result.code} subtype=${subtype} is_error=${isError} timedOut=${result.timedOut}`,
          durationMs: Date.now() - started,
          diagnostics: lastDiag,
          totals: null,
        };
      }

      const collected = collectClaudeJson(payload, {
        runId: `bench-${slot.taskId}-${slot.variant}-${slot.repetition}`,
        taskId: slot.taskId,
        hostVersion: options.hostVersion ?? null,
        privacy: 'strict',
      });

      let success = false;
      if (slot.testCommand?.trim()) {
        // Promote only *.test.ts.example files named by the task's testCommand
        // (avoids forcing add/clamp patch oracles on feature/review tasks).
        const promoteMatch = slot.testCommand.match(
          /(?:^|\s)((?:src\/)?[\w./-]+\.test\.ts)\b/,
        );
        if (promoteMatch) {
          const destRel = promoteMatch[1]!.replace(/^\.\//, '');
          const base = destRel.replace(/\.test\.ts$/, '');
          const example = join(cwd, `${base}.test.ts.example`);
          const dest = join(cwd, destRel);
          try {
            await access(example);
            const body = await readFile(example, 'utf-8');
            await writeFile(dest, body, 'utf-8');
          } catch {
            // Review oracles may ship the .test.ts already (no .example).
          }
        }
        const test = await runShell(slot.testCommand, cwd, 60_000, buildClaudeEnv());
        success = test.code === 0;
      } else {
        success = result.code === 0 && isError !== true;
      }

      const input = collected.totals.input;
      const output = collected.totals.output;
      const cacheRead = collected.totals.cacheRead;
      const cacheWrite = collected.totals.cacheWrite;
      const tokensTotal =
        (input ?? 0) + (output ?? 0) + (cacheRead ?? 0) + (cacheWrite ?? 0);

      // Prefer collector event basis; fall back to model-id rules for :free.
      const runEnd = collected.events.find((e) => e.event === 'run.end');
      const costBasis: BenchCostBasis =
        (runEnd?.cost?.basis as BenchCostBasis | undefined) ??
        (collected.totals.costUsd === null
          ? 'none'
          : resolveClaudeJsonCostBasis(options.modelId));

      const cell: BenchRunCell = {
        taskId: slot.taskId,
        variant: slot.variant,
        repetition: slot.repetition,
        success,
        iterations: 1,
        retries: attempt - 1,
        calls: 1,
        tokensTotal: tokensTotal > 0 ? tokensTotal : null,
        tokensInput: input,
        tokensOutput: output,
        tokensCacheRead: cacheRead,
        tokensCacheWrite: cacheWrite,
        costUsd: collected.totals.costUsd,
        costBasis,
        durationMs: Date.now() - started,
        cacheHitRate:
          input && cacheRead && input > 0 ? cacheRead / (input + cacheRead) : null,
        firstTry: success && attempt === 1,
        modelId: options.modelId,
        hostVersion: options.hostVersion ?? null,
      };

      return {
        cell,
        pending: false,
        pendingReason: null,
        durationMs: Date.now() - started,
        diagnostics: lastDiag,
        totals: {
          input,
          output,
          cacheRead,
          cacheWrite,
          costUsd: collected.totals.costUsd,
        },
      };
    }

    return {
      cell: null,
      pending: true,
      pendingReason: 'exhausted attempts without valid cell',
      durationMs: Date.now() - started,
      diagnostics: lastDiag,
      totals: null,
    };
  } catch (err) {
    return {
      cell: null,
      pending: true,
      pendingReason: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - started,
      diagnostics: {
        ...lastDiag,
        stderrTruncated: sanitizeStderr(
          err instanceof Error ? err.message : String(err),
        ),
      },
      totals: null,
    };
  } finally {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
