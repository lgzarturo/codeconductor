/**
 * Live Claude Code host for cheap bench cells (OpenRouter :free).
 * Spawns `claude -p --output-format stream-json` in a clean fixture workdir
 * and meters every API request (subagents included) against a run budget.
 * Treatment cells install the CodeConductor Claude preset (the harness under
 * evaluation) into the workdir first; baseline cells run the bare fixture.
 *
 * Diagnostics are sanitized (§7): exit code, truncated stderr (no keys),
 * subtype / is_error — never session ids, prompts, or raw host JSON blobs.
 */
import { spawn } from 'node:child_process';
import { cp, mkdtemp, rm, writeFile, readFile, access, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  collectClaudeJson,
  resolveClaudeJsonCostBasis,
} from '../../telemetry/collectors/claude-json';
import { installPresetCommand } from '../../../commands/install.command';
import {
  buildClaudeChildEnv,
  isProxyLocalToken,
} from './openrouter-request-proxy';
import type { BenchCostBasis, BenchRunCell } from './report';

/** `openrouter` = CI via local request proxy; `anthropic` = local Claude Code auth. */
export type BenchProvider = 'openrouter' | 'anthropic';

export interface ClaudeHostSlot {
  taskId: string;
  variant: 'baseline' | 'treatment';
  repetition: number;
  prompt: string;
  testCommand?: string;
}

/**
 * Hard per-run budget shared by the smoke and every cell. Claude is killed
 * as soon as either cap is reached; in-flight requests may overshoot by one.
 */
export interface BenchBudget {
  maxTokens: number;
  maxRequests: number;
  tokens: number;
  requests: number;
}

export function createBenchBudget(maxTokens: number, maxRequests: number): BenchBudget {
  return { maxTokens, maxRequests, tokens: 0, requests: 0 };
}

/** Reason string when the budget is spent, else null. */
export function budgetExhausted(budget: BenchBudget): string | null {
  if (budget.requests >= budget.maxRequests) {
    return `request budget exhausted: ${budget.requests}/${budget.maxRequests}`;
  }
  if (budget.tokens >= budget.maxTokens) {
    return `token budget exhausted: ${budget.tokens}/${budget.maxTokens}`;
  }
  return null;
}

function usageTotal(usage: unknown): number {
  if (!usage || typeof usage !== 'object') return 0;
  const u = usage as Record<string, unknown>;
  const n = (k: string) => (typeof u[k] === 'number' ? (u[k] as number) : 0);
  return (
    n('input_tokens') +
    n('output_tokens') +
    n('cache_read_input_tokens') +
    n('cache_creation_input_tokens')
  );
}

/**
 * Meter one stream-json line. Each distinct assistant `message.id` is one API
 * request (main loop or subagent); its tokens are the largest usage seen for
 * that id. Returns the parsed `result` payload when the line is the final one.
 */
export function meterStreamLine(
  line: string,
  seen: Map<string, number>,
  budget: BenchBudget,
): unknown {
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (msg.type === 'result') return msg;
  if (msg.type !== 'assistant') return null;
  const inner = msg.message as { id?: unknown; usage?: unknown } | undefined;
  if (!inner || typeof inner.id !== 'string') return null;
  const tokens = usageTotal(inner.usage);
  const prev = seen.get(inner.id);
  if (prev === undefined) {
    budget.requests += 1;
    seen.set(inner.id, tokens);
    budget.tokens += tokens;
  } else if (tokens > prev) {
    seen.set(inner.id, tokens);
    budget.tokens += tokens - prev;
  }
  return null;
}

export interface ClaudeHostOptions {
  fixtureDir: string;
  modelId: string;
  budget: BenchBudget;
  /** Claude Code binary (default: claude). */
  claudeBin?: string;
  /** Per-cell timeout ms (default 5 min). */
  timeoutMs?: number;
  /** Minimum ms between Claude invocations (default 3000 ≈ 20/min). */
  minIntervalMs?: number;
  hostVersion?: string | null;
  /** Max attempts per cell on 429 / empty (default 2). */
  maxAttempts?: number;
  /** Main-loop turn cap per attempt (default 5). */
  maxTurns?: number;
  /** Called before each spawn (rate-limit / abort hooks). */
  beforeCall?: () => Promise<void> | void;
  /** Default `openrouter`. */
  provider?: BenchProvider;
  /** Remaining USD for this cell; passed as `--max-budget-usd` (anthropic only). */
  maxBudgetUsd?: number;
}

  /** Sanitized per-invocation diagnostics (safe for artifacts). */
export interface ClaudeHostDiagnostics {
  exitCode: number | null;
  /** stderr truncated to 500 chars, secrets scrubbed. */
  stderrTruncated: string | null;
  /**
   * When `is_error=true`, Claude Code puts the API error in stream-json `result`.
   * Sanitized + truncated (~500); never keys, session ids, or filesystem paths.
   */
  resultTruncated: string | null;
  subtype: string | null;
  isError: boolean | null;
  timedOut: boolean;
  http429: boolean;
  /** True when the 429 is the fail-closed request budget (abort, do not retry). */
  requestBudgetExhausted: boolean;
  attempt: number;
}

export interface ClaudeHostCellResult {
  cell: BenchRunCell | null;
  pending: boolean;
  pendingReason: string | null;
  durationMs: number;
  diagnostics: ClaudeHostDiagnostics;
  /** Host-reported `total_cost_usd` summed over every attempt (pending included). */
  spentUsd: number;
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

/** Scrub secrets, session ids, and filesystem paths; truncate for artifacts. */
export function sanitizeStderr(stderr: string, maxLen = 500): string {
  let s = stderr
    .replace(/sk-or-v1-[A-Za-z0-9_-]+/g, '[REDACTED_OR_KEY]')
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, '[REDACTED_ANT_KEY]')
    .replace(/cc-proxy-local-[A-Za-z0-9_-]+/g, '[REDACTED_PROXY_LOCAL]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/ANTHROPIC_AUTH_TOKEN=\S+/g, 'ANTHROPIC_AUTH_TOKEN=[REDACTED]')
    .replace(/OPENROUTER_API_KEY=\S+/g, 'OPENROUTER_API_KEY=[REDACTED]')
    .replace(/session[_-]?id["\s:=]+[A-Za-z0-9_-]+/gi, 'session_id=[REDACTED]')
    // Absolute and home-relative paths (Unix + Windows).
    .replace(/\/(?:home|Users|tmp|var|opt|workspace|runner)\/[^\s"'\\]+/gi, '[REDACTED_PATH]')
    .replace(/[A-Za-z]:\\[^\s"']+/g, '[REDACTED_PATH]')
    .replace(/~\/[^\s"']+/g, '[REDACTED_PATH]');
  if (s.length > maxLen) s = `${s.slice(0, maxLen)}…`;
  return s;
}

/**
 * When `is_error=true`, Claude Code places the API error message in `result`
 * (string). Sanitize + truncate for artifacts; otherwise null.
 */
export function extractSanitizedErrorResult(
  payload: unknown,
  isError: boolean | null,
  maxLen = 500,
): string | null {
  if (isError !== true || !payload || typeof payload !== 'object') return null;
  const rec = payload as Record<string, unknown>;
  const raw = rec.result;
  if (typeof raw !== 'string' || raw.trim().length === 0) return null;
  return sanitizeStderr(raw, maxLen);
}

function emptyDiagnostics(attempt: number): ClaudeHostDiagnostics {
  return {
    exitCode: null,
    stderrTruncated: null,
    resultTruncated: null,
    subtype: null,
    isError: null,
    timedOut: false,
    http429: false,
    requestBudgetExhausted: false,
    attempt,
  };
}

function extractMeta(payload: unknown): { subtype: string | null; isError: boolean | null } {
  if (!payload || typeof payload !== 'object') {
    return { subtype: null, isError: null };
  }
  const rec = payload as Record<string, unknown>;
  // `result` is often the error *string* when is_error=true — do not treat it as nested meta.
  const nested =
    rec.result && typeof rec.result === 'object' && !Array.isArray(rec.result)
      ? (rec.result as { subtype?: string })
      : null;
  const subtype =
    typeof rec.subtype === 'string'
      ? rec.subtype
      : typeof nested?.subtype === 'string'
        ? nested.subtype
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

/** Proxy fail-closed budget 403 (or stream meter) — abort the run, do not retry. */
export function looksLikeRequestBudgetExhausted(
  stderr: string,
  stdout: string,
): boolean {
  const blob = `${stderr}\n${stdout}`;
  return (
    blob.includes('request_budget_exhausted') ||
    blob.includes('cc_proxy_budget') ||
    /request budget exhausted/i.test(blob)
  );
}

export function isRequestBudgetAbortReason(reason: string | null | undefined): boolean {
  if (!reason) return false;
  return (
    reason.includes('request_budget_exhausted') ||
    reason.includes('cc_proxy_budget') ||
    /request budget exhausted/i.test(reason) ||
    /token budget exhausted/i.test(reason)
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
 * Private Claude Code config dir (CLAUDE_CONFIG_DIR) that trusts exactly `cwd`.
 * Trust lives in `.claude.json → projects[cwd]`; without it the treatment's
 * `.claude/settings.json` permissions are ignored. Also keeps the user's
 * `~/.claude` (plugins, hooks, global CLAUDE.md) out of both arms.
 * Caller removes the dir. Writes no secrets.
 */
export async function prepareIsolatedClaudeConfig(cwd: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'cc-bench-claude-config-'));
  const project = { hasTrustDialogAccepted: true, hasCompletedProjectOnboarding: true };
  const projects: Record<string, typeof project> = { [cwd]: project };
  // Claude Code keys projects by the resolved cwd (symlinked tmpdirs differ).
  projects[await realpath(cwd)] = project;
  await writeFile(
    join(dir, '.claude.json'),
    JSON.stringify({ hasCompletedOnboarding: true, projects }, null, 2),
    'utf-8',
  );
  await writeFile(join(dir, 'settings.json'), '{}\n', 'utf-8');
  return dir;
}

const ANTHROPIC_MODEL_ALIASES: Record<string, string> = {
  opus: 'claude-opus-5-5',
  sonnet: 'claude-sonnet-5-5',
  haiku: 'claude-haiku-5-5',
};

/** `opus|sonnet|haiku` → full Claude model id; full ids pass through. */
export function resolveAnthropicModel(alias: string): string {
  return ANTHROPIC_MODEL_ALIASES[alias.trim().toLowerCase()] ?? alias.trim();
}

/**
 * Route every model alias Claude Code may pick (main loop, haiku background
 * calls, harness agents declaring sonnet/opus, subagents) to the :free model,
 * so no request can land on a paid OpenRouter model.
 *
 * Never inherits OPENROUTER_API_KEY. Live runs must present a minted
 * `cc-proxy-local-*` token (ANTHROPIC_AUTH_TOKEN) and point ANTHROPIC_BASE_URL
 * at the local request proxy — no direct openrouter.ai fallback.
 */
export function buildClaudeEnv(
  modelId: string,
  provider: BenchProvider = 'openrouter',
): NodeJS.ProcessEnv {
  if (provider === 'anthropic') return buildAnthropicEnv(modelId);
  const localToken = process.env.ANTHROPIC_AUTH_TOKEN;
  const baseUrl = process.env.ANTHROPIC_BASE_URL?.trim();
  if (isProxyLocalToken(localToken) && baseUrl) {
    return buildClaudeChildEnv({
      modelId,
      proxyBaseUrl: baseUrl,
      localAuthToken: localToken!,
      parentEnv: process.env,
    });
  }
  // Offline / unit-test path (fake claude): whitelist only, still no OpenRouter key.
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    USER: process.env.USER,
    LANG: process.env.LANG,
    TMPDIR: process.env.TMPDIR,
    XDG_STATE_HOME: process.env.XDG_STATE_HOME,
    CI: 'true',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    CLAUDE_CODE_MAX_RETRIES: '0',
    ANTHROPIC_MAX_RETRIES: '0',
    CLAUDE_CODE_VERSION: process.env.CLAUDE_CODE_VERSION,
    ANTHROPIC_API_KEY: '',
    // No openrouter.ai fallback — live path must set the proxy URL + local token.
    ANTHROPIC_BASE_URL: baseUrl || '',
    ANTHROPIC_AUTH_TOKEN: localToken || '',
    ANTHROPIC_MODEL: modelId,
    ANTHROPIC_SMALL_FAST_MODEL: modelId,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: modelId,
    ANTHROPIC_DEFAULT_SONNET_MODEL: modelId,
    ANTHROPIC_DEFAULT_OPUS_MODEL: modelId,
    CLAUDE_CODE_SUBAGENT_MODEL: modelId,
  };
  delete env.OPENROUTER_API_KEY;
  return env;
}

/**
 * Local Claude Code auth: OAuth token (preferred) or API key from the parent.
 * No base URL override, no OpenRouter key. Every alias and subagent is pinned
 * to `modelId` so both arms compare a single model. Fail-closed without auth.
 */
function buildAnthropicEnv(modelId: string): NodeJS.ProcessEnv {
  const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN?.trim();
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!oauthToken && !apiKey) {
    throw new Error(
      'anthropic provider requires CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY',
    );
  }
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    USER: process.env.USER,
    LANG: process.env.LANG,
    TMPDIR: process.env.TMPDIR,
    CI: 'true',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    CLAUDE_CODE_VERSION: process.env.CLAUDE_CODE_VERSION,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: modelId,
    ANTHROPIC_DEFAULT_SONNET_MODEL: modelId,
    ANTHROPIC_DEFAULT_OPUS_MODEL: modelId,
    CLAUDE_CODE_SUBAGENT_MODEL: modelId,
  };
  if (oauthToken) env.CLAUDE_CODE_OAUTH_TOKEN = oauthToken;
  else env.ANTHROPIC_API_KEY = apiKey;
  return env;
}

/**
 * Spawn Claude Code directly (no shell, so a kill reaches the process that
 * makes API calls) and meter its stream-json output against `budget`.
 * Kills Claude the moment the budget is spent.
 */
function runClaude(
  claudeBin: string,
  prompt: string,
  modelId: string,
  maxTurns: number,
  cwd: string,
  timeoutMs: number,
  budget: BenchBudget,
  configDir: string,
  provider: BenchProvider,
  maxBudgetUsd?: number,
): Promise<{
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  payload: unknown;
  requests: number;
  budgetStop: string | null;
}> {
  // Throws before spawning when anthropic auth is missing.
  const env = { ...buildClaudeEnv(modelId, provider), CLAUDE_CONFIG_DIR: configDir };
  const budgetArgs =
    provider === 'anthropic' && maxBudgetUsd !== undefined
      ? ['--max-budget-usd', String(maxBudgetUsd)]
      : [];
  return new Promise((resolve) => {
    let timedOut = false;
    let budgetStop: string | null = null;
    let payload: unknown = null;
    let stdout = '';
    let stderr = '';
    let pending = '';
    const seen = new Map<string, number>();
    const child = spawn(
      claudeBin,
      [
        '-p',
        prompt,
        '--output-format',
        'stream-json',
        '--verbose',
        '--max-turns',
        String(maxTurns),
        '--dangerously-skip-permissions',
        '--model',
        modelId,
        ...budgetArgs,
      ],
      { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    const onLine = (line: string) => {
      const result = meterStreamLine(line, seen, budget);
      if (result) payload = result;
      if (!budgetStop) {
        budgetStop = budgetExhausted(budget);
        if (budgetStop) child.kill('SIGKILL');
      }
    };
    child.stdout?.on('data', (d: Buffer) => {
      const text = d.toString('utf8');
      stdout += text;
      pending += text;
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) onLine(line);
    });
    child.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString('utf8');
    });
    const finish = (code: number) => {
      clearTimeout(timer);
      if (pending) onLine(pending);
      // A spawn that produced no assistant message still hit the API once.
      if (seen.size === 0 && !budgetStop) {
        budget.requests += 1;
        budgetStop = budgetExhausted(budget);
      }
      resolve({
        code,
        stdout,
        stderr,
        timedOut,
        payload,
        requests: Math.max(seen.size, 1),
        budgetStop,
      });
    };
    child.on('close', (code) => finish(code ?? 1));
    child.on('error', (err) => {
      stderr += String(err);
      finish(1);
    });
  });
}

/**
 * Smoke: `claude -p "di hola"` (one turn), metered against `budget`.
 * Up to 2 attempts. Returns diagnostics only (no secrets).
 */
export async function runClaudeSmoke(
  options: {
    modelId: string;
    budget: BenchBudget;
    claudeBin?: string;
    timeoutMs?: number;
    maxAttempts?: number;
    provider?: BenchProvider;
  },
): Promise<{
  ok: boolean;
  attempts: ClaudeHostDiagnostics[];
  reason: string | null;
}> {
  const configDir = await prepareIsolatedClaudeConfig(process.cwd());
  try {
    return await smokeAttempts(options, configDir);
  } finally {
    await rm(configDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function smokeAttempts(
  options: Parameters<typeof runClaudeSmoke>[0],
  configDir: string,
): Promise<{
  ok: boolean;
  attempts: ClaudeHostDiagnostics[];
  reason: string | null;
}> {
  const maxAttempts = options.maxAttempts ?? 2;
  const timeoutMs = options.timeoutMs ?? 120_000;
  const claudeBin = options.claudeBin ?? 'claude';
  const attempts: ClaudeHostDiagnostics[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const spent = budgetExhausted(options.budget);
    if (spent) return { ok: false, attempts, reason: `smoke skipped: ${spent}` };
    await rateLimit(3_000);
    const result = await runClaude(
      claudeBin,
      'di hola',
      options.modelId,
      1,
      process.cwd(),
      timeoutMs,
      options.budget,
      configDir,
      options.provider ?? 'openrouter',
    );
    const http429 = looksLike429(result.stderr, result.stdout);
    const requestBudgetExhausted =
      Boolean(result.budgetStop && isRequestBudgetAbortReason(result.budgetStop)) ||
      looksLikeRequestBudgetExhausted(result.stderr, result.stdout);
    let subtype: string | null = null;
    let isError: boolean | null = null;
    let parsedOk = false;
    try {
      const payload = result.payload;
      if (!payload) throw new Error('no result line');
      const meta = extractMeta(payload);
      subtype = meta.subtype;
      isError = meta.isError;
      parsedOk = true;
      const resultTruncated = extractSanitizedErrorResult(payload, isError);
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
          resultTruncated,
          subtype,
          isError,
          timedOut: result.timedOut,
          http429,
          requestBudgetExhausted,
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
      resultTruncated: extractSanitizedErrorResult(result.payload, isError),
      subtype,
      isError,
      timedOut: result.timedOut,
      http429,
      requestBudgetExhausted,
      attempt,
    });

    // Budget 429 / stream cap: do not retry — caller must abort the run.
    if (requestBudgetExhausted) {
      break;
    }

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
    ? `smoke failed after ${attempts.length} attempts: exit=${last.exitCode} timedOut=${last.timedOut} 429=${last.http429} subtype=${last.subtype} is_error=${last.isError} result=${last.resultTruncated ?? ''} stderr=${last.stderrTruncated ?? ''}`
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
  const maxTurns = options.maxTurns ?? 5;
  const provider = options.provider ?? 'openrouter';
  const started = Date.now();

  let workDir: string | null = null;
  let configDir: string | null = null;
  let lastDiag = emptyDiagnostics(0);
  let requests = 0;
  let spentUsd = 0;

  try {
    workDir = await mkdtemp(join(tmpdir(), 'cc-bench-live-'));
    await cp(options.fixtureDir, join(workDir, 'fixture'), { recursive: true });
    const cwd = join(workDir, 'fixture');
    configDir = await prepareIsolatedClaudeConfig(cwd);

    if (slot.variant === 'treatment') {
      // The harness under evaluation: same installer users run.
      const install = await installPresetCommand({
        target: 'claude',
        dryRun: false,
        force: true,
        global: false,
        output: 'json',
        projectRoot: cwd,
        locale: 'en',
      });
      if (install.code !== 0) {
        throw new Error(`harness install failed (code ${install.code})`);
      }
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const spent = budgetExhausted(options.budget);
      if (spent) {
        return {
          cell: null,
          pending: true,
          pendingReason: spent,
          durationMs: Date.now() - started,
          diagnostics: lastDiag,
          spentUsd,
          totals: null,
        };
      }
      await options.beforeCall?.();
      await rateLimit(minIntervalMs);

      const result = await runClaude(
        claudeBin,
        slot.prompt,
        options.modelId,
        maxTurns,
        cwd,
        timeoutMs,
        options.budget,
        configDir,
        provider,
        options.maxBudgetUsd,
      );
      requests += result.requests;
      const http429 = looksLike429(result.stderr, result.stdout);
      const requestBudgetExhausted =
        Boolean(result.budgetStop && isRequestBudgetAbortReason(result.budgetStop)) ||
        looksLikeRequestBudgetExhausted(result.stderr, result.stdout);
      const payload = result.payload;
      let subtype: string | null = null;
      let isError: boolean | null = null;
      if (payload) {
        const meta = extractMeta(payload);
        subtype = meta.subtype;
        isError = meta.isError;
        const cost = (payload as { total_cost_usd?: unknown }).total_cost_usd;
        if (typeof cost === 'number') spentUsd += cost;
      }

      lastDiag = {
        exitCode: result.code,
        stderrTruncated: sanitizeStderr(result.stderr),
        resultTruncated: extractSanitizedErrorResult(payload, isError),
        subtype,
        isError,
        timedOut: result.timedOut,
        http429,
        requestBudgetExhausted,
        attempt,
      };

      if (result.budgetStop || requestBudgetExhausted) {
        return {
          cell: null,
          pending: true,
          pendingReason:
            result.budgetStop ??
            'request budget exhausted (proxy 403 cc_proxy_budget)',
          durationMs: Date.now() - started,
          diagnostics: lastDiag,
          spentUsd,
          totals: null,
        };
      }

      // --max-budget-usd hit: retrying would only spend more.
      if (subtype === 'error_max_budget_usd') {
        return {
          cell: null,
          pending: true,
          pendingReason: 'spend budget exhausted (--max-budget-usd)',
          durationMs: Date.now() - started,
          diagnostics: lastDiag,
          spentUsd,
          totals: null,
        };
      }

      if (http429 && attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 15_000));
        continue;
      }

      // Hitting --max-turns is a valid (likely failed) sample: let the oracle
      // judge it instead of retrying and doubling the spend.
      if (!payload || (isError === true && subtype !== 'error_max_turns')) {
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
          spentUsd,
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
        const test = await runShell(
          slot.testCommand,
          cwd,
          60_000,
          buildClaudeEnv(options.modelId, provider),
        );
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
          // Sound: the resolver only ever returns 'unknown' | 'host-estimate'.
          : (resolveClaudeJsonCostBasis(options.modelId) as BenchCostBasis));

      const cell: BenchRunCell = {
        taskId: slot.taskId,
        variant: slot.variant,
        repetition: slot.repetition,
        success,
        iterations: 1,
        retries: attempt - 1,
        calls: requests,
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
        spentUsd,
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
      spentUsd,
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
      spentUsd,
      totals: null,
    };
  } finally {
    for (const dir of [workDir, configDir]) {
      if (dir) await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
