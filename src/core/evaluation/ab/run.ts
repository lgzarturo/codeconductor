/**
 * T-034 A/B runner: sin-arnés vs con-arnés, report outside the repo.
 * Live path reuses the OpenRouter request proxy (fail-closed) + Claude host.
 */
import { resolve } from 'node:path';
import { loadHarnessSuite } from '../harness-experiment';
import {
  createBenchBudget,
  ensureClaudeCiConfig,
  runClaudeHostCell,
  type BenchBudget,
} from '../bench/host-claude';
import {
  DEFAULT_OPENROUTER_RATE_LIMIT_PER_MIN,
  defaultRequestCounterPath,
  mintProxyLocalToken,
  startOpenRouterRequestProxy,
  type OpenRouterRequestProxy,
} from '../bench/openrouter-request-proxy';
import { createLcg } from '../bench/stats';
import {
  AB_DEFAULT_MODEL,
  AB_DEFAULT_N,
  AB_MIN_MAX_TURNS,
  AB_RATE_LIMIT_PER_MIN,
  AB_REQUEST_CAP,
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
}

export interface AbRunResult {
  code: number;
  report: AbFinalReport | null;
  reportPaths: { jsonPath: string; mdPath: string } | null;
  dryRunMessages: string[];
  error: string | null;
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

function interleaveAbSchedule(
  taskIds: string[],
  n: number,
  seed: number,
): Array<{ taskId: string; arm: AbArmId; repetition: number }> {
  const rng = createLcg(seed);
  const pairs: Array<Array<{ taskId: string; arm: AbArmId; repetition: number }>> = [];
  for (const taskId of taskIds) {
    for (let rep = 1; rep <= n; rep++) {
      // A/B/A/B within each pair; shuffle pair order only.
      pairs.push([
        { taskId, arm: 'sin-arnes', repetition: rep },
        { taskId, arm: 'con-arnes', repetition: rep },
      ]);
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

async function runLiveAb(options: {
  provider: AbProvider;
  modelId: string;
  outDir: string;
  n: number;
  maxTurns: number;
  seed: number;
  projectRoot: string;
  apiKey: string;
}): Promise<AbRunResult> {
  const suite = await loadHarnessSuite(options.projectRoot, 'harness-v1');
  if (!suite.success) {
    return {
      code: 1,
      report: null,
      reportPaths: null,
      dryRunMessages: [],
      error: suite.error.message,
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

  await ensureClaudeCiConfig();
  const localAuthToken = mintProxyLocalToken();
  process.env.ANTHROPIC_API_KEY = '';
  process.env.ANTHROPIC_AUTH_TOKEN = localAuthToken;

  let proxy: OpenRouterRequestProxy | null = null;
  const cells: AbRunCell[] = [];
  let capReached = false;
  let abortNote: string | null = null;
  const budget: BenchBudget = createBenchBudget(2_000_000, requestCap);

  try {
    proxy = await startOpenRouterRequestProxy({
      counterPath: defaultRequestCounterPath(`ab-${Date.now()}`),
      maxRequests: requestCap,
      maxRequestsPerMinute: AB_RATE_LIMIT_PER_MIN || DEFAULT_OPENROUTER_RATE_LIMIT_PER_MIN,
      initialCount: 0,
      upstreamApiKey: options.apiKey,
      localAuthToken,
    });
    process.env.ANTHROPIC_BASE_URL = proxy.anthropicBaseUrl;

    for (const slot of schedule) {
      if (capReached) break;
      if (budget.requests >= budget.maxRequests) {
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

      const proxyCount = await proxy.readCount();
      if (proxyCount >= requestCap || host.diagnostics.requestBudgetExhausted) {
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
    // never leave OPENROUTER key in Claude env (parent may still hold it)
    process.env.ANTHROPIC_AUTH_TOKEN = '';
    process.env.ANTHROPIC_BASE_URL = '';
  }

  let requestCount: number | null = null;
  if (proxy) {
    try {
      requestCount = await proxy.readCount();
    } catch {
      requestCount = null;
    }
    await proxy.close().catch(() => undefined);
  }

  const report = buildAbReport({
    provider: options.provider,
    modelId: options.modelId,
    maxTurns: options.maxTurns,
    requestCap,
    requestCount,
    capReached,
    usageDeltaUsd: null,
    costLabel: 'desconocido',
    cells,
    notes: abortNote ? [abortNote] : [],
  });
  const paths = await writeAbReport(options.outDir, report);
  const code = capReached ? 2 : 0;
  return {
    code,
    report,
    reportPaths: paths,
    dryRunMessages: [],
    error: capReached ? 'tope alcanzado' : null,
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
    };
  }
  const provider = options.provider;
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  const outDir = resolve(options.out?.trim() || defaultAbOutDir());
  const maxTurns = Math.max(options.maxTurns ?? AB_MIN_MAX_TURNS, AB_MIN_MAX_TURNS);
  const n = options.n ?? AB_DEFAULT_N;
  const modelId = options.model?.trim() || AB_DEFAULT_MODEL[provider];
  const seed = options.seed ?? 42;

  const suite = await loadHarnessSuite(projectRoot, 'harness-v1');
  if (!suite.success) {
    return {
      code: 1,
      report: null,
      reportPaths: null,
      dryRunMessages: [],
      error: suite.error.message,
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
      costLabel: 'desconocido',
      cells: [],
      notes: dry.messages,
    });
    const paths = await writeAbReport(outDir, report);
    await disposeWorkRoot(dry.workRoot);
    return {
      code: dry.ok ? 0 : 1,
      report,
      reportPaths: paths,
      dryRunMessages: dry.messages,
      error: dry.ok ? null : 'dry-run failed',
    };
  }

  if (options.live === false) {
    return {
      code: 1,
      report: null,
      reportPaths: null,
      dryRunMessages: [],
      error: 'live run disabled',
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
  });
}
