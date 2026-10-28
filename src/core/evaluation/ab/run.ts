/**
 * T-034 A/B runner: sin-arnés vs con-arnés, report outside the repo.
 * Live path reuses the OpenRouter request proxy (fail-closed) + Claude host.
 */
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { loadHarnessSuite } from '../harness-experiment';
import {
  createBenchBudget,
  ensureClaudeCiConfig,
  runClaudeHostCell,
  type BenchBudget,
} from '../bench/host-claude';
import {
  DEFAULT_OPENROUTER_RATE_LIMIT_PER_MIN,
  mintProxyLocalToken,
  readRequestCounter,
  startOpenRouterRequestProxy,
  writeRequestCounter,
  type OpenRouterRequestProxy,
} from '../bench/openrouter-request-proxy';
import { createLcg } from '../bench/stats';
import { fetchOpenRouterKeySnapshot } from '../../telemetry/openrouter-spend-lock';
import {
  AB_DEFAULT_MODEL,
  AB_DEFAULT_N,
  AB_MIN_MAX_TURNS,
  AB_RATE_LIMIT_PER_MIN,
  AB_REQUEST_CAP,
  defaultAbCounterPath,
  defaultAbOutDir,
  isAbProvider,
  type AbProvider,
} from './constants';
import { disposeWorkRoot, runAbDryRun } from './prepare';
import {
  buildAbReport,
  writeAbReport,
  type AbArmId,
  type AbFinalReport,
  type AbRunCell,
} from './report';

function suiteFixtureDir(projectRoot: string, suitePath: string, fixtureDir?: string): string {
  return resolve(suitePath, '..', fixtureDir ?? 'fixture');
}

export interface AbRunCliOptions {
  provider: string;
  model?: string;
  out?: string;
  dryRun?: boolean;
  n?: number;
  maxTurns?: number;
  seed?: number;
  projectRoot?: string;
  /** Test injection: skip live host. */
  live?: boolean;
  /** Reset durable counter for this provider to 0 before live run. */
  resetCounter?: boolean;
  /** Override durable counter path (tests). Default: cache/counter-<provider>.json */
  counterPath?: string;
}

export interface AbRunResult {
  code: number;
  report: AbFinalReport | null;
  reportPaths: { jsonPath: string; mdPath: string } | null;
  dryRunMessages: string[];
  error: string | null;
  counterPath?: string | null;
}

function resolveKey(provider: AbProvider): { key: string } | { error: string } {
  if (provider === 'free') {
    const key = process.env.OPENROUTER_API_KEY?.trim();
    if (!key) {
      return {
        error:
          'Missing OPENROUTER_API_KEY. Set it in your environment (never commit it).',
      };
    }
    return { key };
  }
  const or = process.env.OPENROUTER_API_KEY?.trim();
  if (or) return { key: or };
  const ds = process.env.DEEPSEEK_API_KEY?.trim();
  if (ds) {
    return {
      error:
        'DEEPSEEK_API_KEY is set but this runner hosts Claude Code via the OpenRouter request proxy. Set OPENROUTER_API_KEY and use model deepseek/deepseek-v4-flash.',
    };
  }
  return {
    error:
      'Missing OPENROUTER_API_KEY for --provider deepseek (Claude Code + counting proxy).',
  };
}

/**
 * Interleaved A/B schedule: shuffle pair order, and within each pair randomly
 * choose sin→con or con→sin (seeded) so both orderings appear.
 */
export function interleaveAbSchedule(
  taskIds: string[],
  n: number,
  seed: number,
): Array<{ taskId: string; arm: AbArmId; repetition: number }> {
  const rng = createLcg(seed);
  const pairs: Array<Array<{ taskId: string; arm: AbArmId; repetition: number }>> = [];
  for (const taskId of taskIds) {
    for (let rep = 1; rep <= n; rep++) {
      const sin = { taskId, arm: 'sin-arnes' as const, repetition: rep };
      const con = { taskId, arm: 'con-arnes' as const, repetition: rep };
      // Alternate order inside the pair (true interleaving, not always sin→con).
      if (rng() < 0.5) {
        pairs.push([sin, con]);
      } else {
        pairs.push([con, sin]);
      }
    }
  }
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = pairs[i]!;
    pairs[i] = pairs[j]!;
    pairs[j] = tmp;
  }
  return pairs.flat();
}

/** Reset durable campaign counter to 0 for provider (or explicit path). */
export async function resetAbCounter(options: {
  provider: AbProvider;
  counterPath: string;
  maxRequests: number;
}): Promise<void> {
  await mkdir(dirname(options.counterPath), { recursive: true });
  await writeRequestCounter(options.counterPath, {
    schema: 'openrouter-request-counter/v1',
    count: 0,
    max: options.maxRequests,
    updatedAt: new Date().toISOString(),
  });
}

async function readExistingCount(counterPath: string): Promise<number | null> {
  try {
    return (await readRequestCounter(counterPath)).count;
  } catch {
    return null;
  }
}

async function runLiveAb(options: {
  provider: AbProvider;
  modelId: string;
  outDir: string;
  n: number;
  maxTurns: number;
  seed: number;
  projectRoot: string;
  apiKey: string;
  counterPath: string;
  resetCounter: boolean;
}): Promise<AbRunResult> {
  const suite = await loadHarnessSuite(options.projectRoot, 'harness-v1');
  if (!suite.success) {
    return {
      code: 1,
      report: null,
      reportPaths: null,
      dryRunMessages: [],
      error: suite.error.message,
      counterPath: options.counterPath,
    };
  }
  const fixtureDir = suiteFixtureDir(
    options.projectRoot,
    suite.data.path,
    suite.data.fixtureDir,
  );
  const taskIds = suite.data.tasks.map((t) => t.id);
  const schedule = interleaveAbSchedule(taskIds, options.n, options.seed);
  const requestCap = AB_REQUEST_CAP[options.provider];

  await mkdir(dirname(options.counterPath), { recursive: true });
  if (options.resetCounter) {
    await resetAbCounter({
      provider: options.provider,
      counterPath: options.counterPath,
      maxRequests: requestCap,
    });
  }

  const alreadyUsed = (await readExistingCount(options.counterPath)) ?? 0;
  if (alreadyUsed >= requestCap) {
    const report = buildAbReport({
      provider: options.provider,
      modelId: options.modelId,
      maxTurns: options.maxTurns,
      requestCap,
      requestCount: alreadyUsed,
      capReached: true,
      usageDeltaUsd: null,
      cells: [],
      notes: ['tope alcanzado', `counter=${options.counterPath}`],
    });
    const paths = await writeAbReport(options.outDir, report);
    return {
      code: 2,
      report,
      reportPaths: paths,
      dryRunMessages: [],
      error: 'tope alcanzado',
      counterPath: options.counterPath,
    };
  }

  await ensureClaudeCiConfig();
  const localAuthToken = mintProxyLocalToken();
  process.env.ANTHROPIC_API_KEY = '';
  process.env.ANTHROPIC_AUTH_TOKEN = localAuthToken;

  let proxy: OpenRouterRequestProxy | null = null;
  const cells: AbRunCell[] = [];
  let capReached = false;
  let abortNote: string | null = null;
  const remaining = Math.max(0, requestCap - alreadyUsed);
  const budget: BenchBudget = createBenchBudget(2_000_000, remaining);

  // GET /api/v1/key — not a countable POST; safe for real usage Δ.
  let usageBefore: number | null = null;
  let usageAfter: number | null = null;
  try {
    const before = await fetchOpenRouterKeySnapshot({ apiKey: options.apiKey });
    usageBefore =
      before && typeof before.usage === 'number' && Number.isFinite(before.usage)
        ? before.usage
        : null;
  } catch {
    usageBefore = null;
  }

  try {
    proxy = await startOpenRouterRequestProxy({
      counterPath: options.counterPath,
      maxRequests: requestCap,
      maxRequestsPerMinute: AB_RATE_LIMIT_PER_MIN || DEFAULT_OPENROUTER_RATE_LIMIT_PER_MIN,
      // Only used when the file does not exist yet.
      initialCount: alreadyUsed,
      upstreamApiKey: options.apiKey,
      localAuthToken,
    });
    process.env.ANTHROPIC_BASE_URL = proxy.anthropicBaseUrl;

    for (const slot of schedule) {
      if (capReached) break;
      const proxyCount = await proxy.readCount();
      if (proxyCount >= requestCap || budget.requests >= budget.maxRequests) {
        capReached = true;
        abortNote = 'tope alcanzado';
        break;
      }

      const task = suite.data.tasks.find((t) => t.id === slot.taskId);
      if (!task) continue;

      const variant = slot.arm === 'con-arnes' ? 'treatment' : 'baseline';
      const skipWarn =
        'AVISO: --dangerously-skip-permissions solo aplica dentro de este directorio temporal de corrida; no uses este flag fuera del arnés de evaluación.';
      const prompt = `${task.prompt}\n\n${skipWarn}`;
      const host = await runClaudeHostCell(
        {
          taskId: slot.taskId,
          variant,
          repetition: slot.repetition,
          prompt,
          testCommand: task.testCommand,
        },
        {
          fixtureDir,
          modelId: options.modelId,
          budget,
          maxTurns: options.maxTurns,
          maxAttempts: 1,
          minIntervalMs: 3_000,
        },
      );

      const countNow = await proxy.readCount();
      if (countNow >= requestCap || host.diagnostics.requestBudgetExhausted) {
        capReached = true;
        abortNote = 'tope alcanzado';
      }

      if (host.pending && host.pendingReason?.includes('budget')) {
        capReached = true;
        abortNote = 'tope alcanzado';
        cells.push({
          taskId: slot.taskId,
          arm: slot.arm,
          repetition: slot.repetition,
          success: null,
          finished: false,
          tokensIn: null,
          tokensOut: null,
          requests: null,
          iterations: null,
          retries: null,
          durationMs: host.durationMs,
          costUsd: null,
          error: host.pendingReason,
        });
        break;
      }

      cells.push({
        taskId: slot.taskId,
        arm: slot.arm,
        repetition: slot.repetition,
        success: host.cell ? host.cell.success : null,
        finished: Boolean(host.cell),
        tokensIn: host.totals?.input ?? null,
        tokensOut: host.totals?.output ?? null,
        requests: host.cell?.calls ?? null,
        iterations: host.cell?.iterations ?? null,
        retries: host.cell?.retries ?? null,
        durationMs: host.durationMs,
        costUsd: host.totals?.costUsd ?? host.cell?.costUsd ?? null,
        error: host.pending ? host.pendingReason : null,
      });
    }
  } catch (err) {
    abortNote = err instanceof Error ? err.message : String(err);
    if (/budget exhausted|tope|403/i.test(abortNote)) {
      capReached = true;
      abortNote = 'tope alcanzado';
    }
  } finally {
    process.env.ANTHROPIC_AUTH_TOKEN = '';
    process.env.ANTHROPIC_BASE_URL = '';
  }

  try {
    const after = await fetchOpenRouterKeySnapshot({ apiKey: options.apiKey });
    usageAfter =
      after && typeof after.usage === 'number' && Number.isFinite(after.usage)
        ? after.usage
        : null;
  } catch {
    usageAfter = null;
  }

  let requestCount: number | null = null;
  if (proxy) {
    try {
      requestCount = await proxy.readCount();
    } catch {
      requestCount = await readExistingCount(options.counterPath);
    }
    await proxy.close().catch(() => undefined);
  } else {
    requestCount = await readExistingCount(options.counterPath);
  }

  const usageDeltaUsd =
    usageBefore !== null && usageAfter !== null ? usageAfter - usageBefore : null;

  const notes: string[] = [];
  if (abortNote) notes.push(abortNote);
  notes.push(`counter=${options.counterPath}`);
  if (usageDeltaUsd === null) {
    notes.push(
      'cost: OpenRouter usage Δ unavailable → estimado from host costUsd if present, else desconocido',
    );
  }

  const report = buildAbReport({
    provider: options.provider,
    modelId: options.modelId,
    maxTurns: options.maxTurns,
    requestCap,
    requestCount,
    capReached,
    usageDeltaUsd,
    cells,
    notes,
  });
  const paths = await writeAbReport(options.outDir, report);
  const code = capReached ? 2 : 0;
  return {
    code,
    report,
    reportPaths: paths,
    dryRunMessages: [],
    error: capReached ? 'tope alcanzado' : null,
    counterPath: options.counterPath,
  };
}

export async function runAb(options: AbRunCliOptions): Promise<AbRunResult> {
  if (!isAbProvider(options.provider)) {
    return {
      code: 1,
      report: null,
      reportPaths: null,
      dryRunMessages: [],
      error: `Invalid --provider ${options.provider}. Use free|deepseek.`,
      counterPath: null,
    };
  }
  const provider = options.provider;
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  const outDir = resolve(options.out?.trim() || defaultAbOutDir());
  const maxTurns = Math.max(options.maxTurns ?? AB_MIN_MAX_TURNS, AB_MIN_MAX_TURNS);
  const n = options.n ?? AB_DEFAULT_N;
  const modelId = options.model?.trim() || AB_DEFAULT_MODEL[provider];
  const seed = options.seed ?? 42;
  const counterPath = resolve(
    options.counterPath?.trim() || defaultAbCounterPath(provider, outDir),
  );

  const suite = await loadHarnessSuite(projectRoot, 'harness-v1');
  if (!suite.success) {
    return {
      code: 1,
      report: null,
      reportPaths: null,
      dryRunMessages: [],
      error: suite.error.message,
      counterPath,
    };
  }
  const fixtureDir = suiteFixtureDir(projectRoot, suite.data.path, suite.data.fixtureDir);

  if (options.dryRun) {
    const dry = await runAbDryRun(fixtureDir);
    const report = buildAbReport({
      provider,
      modelId,
      maxTurns,
      requestCap: AB_REQUEST_CAP[provider],
      requestCount: 0,
      capReached: false,
      usageDeltaUsd: null,
      cells: [],
      notes: [
        ...dry.messages,
        'cost: dry-run — desconocido (no OpenRouter usage Δ)',
        `counter=${counterPath} (not advanced in dry-run)`,
      ],
    });
    const paths = await writeAbReport(outDir, report);
    await disposeWorkRoot(dry.workRoot);
    return {
      code: dry.ok ? 0 : 1,
      report,
      reportPaths: paths,
      dryRunMessages: dry.messages,
      error: dry.ok ? null : 'dry-run failed',
      counterPath,
    };
  }

  if (options.live === false) {
    return {
      code: 1,
      report: null,
      reportPaths: null,
      dryRunMessages: [],
      error: 'live run disabled',
      counterPath,
    };
  }

  const key = resolveKey(provider);
  if ('error' in key) {
    return {
      code: 1,
      report: null,
      reportPaths: null,
      dryRunMessages: [],
      error: key.error,
      counterPath,
    };
  }

  return runLiveAb({
    provider,
    modelId,
    outDir,
    n,
    maxTurns,
    seed,
    projectRoot,
    apiKey: key.key,
    counterPath,
    resetCounter: options.resetCounter === true,
  });
}
