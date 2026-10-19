/**
 * Collector for Claude Code `claude -p --output-format json` (and Agent SDK result).
 * Source of truth in headless: modelUsage + total_cost_usd.
 * Fields the host does not expose stay null (never 0).
 */
import {
  createBaseEvent,
  emptyUsage,
  nullableNumber,
  type CostBasis,
  type HarnessTelemetryEvent,
} from '../schema';

export interface ClaudeModelUsageEntry {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  costUSD?: number;
  costBasis?: 'list' | 'managed' | 'unknown' | string;
}

export interface ClaudeJsonResult {
  type?: string;
  subtype?: string;
  total_cost_usd?: number;
  totalCostUsd?: number;
  session_id?: string;
  sessionId?: string;
  duration_ms?: number;
  durationMs?: number;
  modelUsage?: Record<string, ClaudeModelUsageEntry>;
  model_usage?: Record<string, ClaudeModelUsageEntry>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  [key: string]: unknown;
}

export interface CollectClaudeJsonOptions {
  runId: string;
  taskId?: string | null;
  harnessVersion?: string | null;
  harnessCommit?: string | null;
  hostVersion?: string | null;
  /** ISO timestamp override (tests / replay). */
  ts?: string;
  privacy?: 'standard' | 'strict';
}

export interface ClaudeJsonCollection {
  events: HarnessTelemetryEvent[];
  totals: {
    input: number | null;
    output: number | null;
    cacheRead: number | null;
    cacheWrite: number | null;
    costUsd: number | null;
    byModel: Record<
      string,
      {
        input: number | null;
        output: number | null;
        cacheRead: number | null;
        cacheWrite: number | null;
        costUsd: number | null;
        costBasis: string | null;
      }
    >;
  };
  /** Present when the payload had no modelUsage / cost fields. */
  missing: string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

/**
 * Locate the result payload in CLI JSON, SDK stream arrays, or a bare object.
 */
export function extractClaudeJsonResult(payload: unknown): ClaudeJsonResult | null {
  if (payload === null || payload === undefined) return null;

  if (typeof payload === 'string') {
    try {
      return extractClaudeJsonResult(JSON.parse(payload) as unknown);
    } catch {
      return null;
    }
  }

  if (Array.isArray(payload)) {
    for (let i = payload.length - 1; i >= 0; i--) {
      const item = asRecord(payload[i]);
      if (!item) continue;
      if (item.type === 'result' || item.modelUsage || item.model_usage || item.total_cost_usd !== undefined) {
        return item as ClaudeJsonResult;
      }
    }
    return null;
  }

  const obj = asRecord(payload);
  if (!obj) return null;

  if (obj.type === 'result' || obj.modelUsage || obj.model_usage || obj.total_cost_usd !== undefined) {
    return obj as ClaudeJsonResult;
  }

  // Nested wrappers (e.g. { result: { ... } })
  for (const key of ['result', 'data', 'output']) {
    const nested = extractClaudeJsonResult(obj[key]);
    if (nested) return nested;
  }
  return obj as ClaudeJsonResult;
}

function readModelUsage(
  result: ClaudeJsonResult,
): Record<string, ClaudeModelUsageEntry> | null {
  const raw = result.modelUsage ?? result.model_usage;
  if (!raw || typeof raw !== 'object') return null;
  return raw;
}

function sumField(
  entries: Array<ClaudeModelUsageEntry>,
  field: keyof ClaudeModelUsageEntry,
): number | null {
  let any = false;
  let sum = 0;
  for (const e of entries) {
    const v = nullableNumber(e[field]);
    if (v === null) continue;
    any = true;
    sum += v;
  }
  return any ? sum : null;
}

/**
 * Parse a Claude Code `-p --output-format json` payload into telemetry events.
 * Totals match modelUsage field-for-field; absent fields stay null.
 */
export function collectClaudeJson(
  payload: unknown,
  options: CollectClaudeJsonOptions,
): ClaudeJsonCollection {
  const result = extractClaudeJsonResult(payload);
  const missing: string[] = [];
  const byModel: ClaudeJsonCollection['totals']['byModel'] = {};

  if (!result) {
    missing.push('result');
    return {
      events: [],
      totals: {
        input: null,
        output: null,
        cacheRead: null,
        cacheWrite: null,
        costUsd: null,
        byModel,
      },
      missing,
    };
  }

  const modelUsage = readModelUsage(result);
  if (!modelUsage) missing.push('modelUsage');

  const entries = modelUsage ? Object.entries(modelUsage) : [];
  const usageValues = entries.map(([, v]) => v);

  const totals = {
    input: sumField(usageValues, 'inputTokens'),
    output: sumField(usageValues, 'outputTokens'),
    cacheRead: sumField(usageValues, 'cacheReadInputTokens'),
    cacheWrite: sumField(usageValues, 'cacheCreationInputTokens'),
    costUsd: nullableNumber(result.total_cost_usd ?? result.totalCostUsd),
    byModel,
  };

  if (totals.costUsd === null && usageValues.length > 0) {
    totals.costUsd = sumField(usageValues, 'costUSD');
  }

  for (const [modelId, u] of entries) {
    byModel[modelId] = {
      input: nullableNumber(u.inputTokens),
      output: nullableNumber(u.outputTokens),
      cacheRead: nullableNumber(u.cacheReadInputTokens),
      cacheWrite: nullableNumber(u.cacheCreationInputTokens),
      costUsd: nullableNumber(u.costUSD),
      costBasis: typeof u.costBasis === 'string' ? u.costBasis : null,
    };
  }

  const events: HarnessTelemetryEvent[] = [];
  const base = createBaseEvent({
    runId: options.runId,
    event: 'run.end',
    harnessVersion: options.harnessVersion ?? null,
    harnessCommit: options.harnessCommit ?? null,
    ts: options.ts,
    privacy: options.privacy ?? 'standard',
  });
  base.taskId = options.taskId ?? null;
  base.host = {
    name: 'claude-code',
    version: options.hostVersion ?? null,
    mode: 'headless',
  };
  base.durationMs = nullableNumber(result.duration_ms ?? result.durationMs);
  base.source = { usage: 'cc-json', reliability: 'high' };

  // One model.call per model in modelUsage (per-model breakdown).
  for (const [modelId, u] of entries) {
    const call = createBaseEvent({
      runId: options.runId,
      event: 'model.call',
      harnessVersion: options.harnessVersion ?? null,
      harnessCommit: options.harnessCommit ?? null,
      ts: options.ts,
      privacy: options.privacy ?? 'standard',
    });
    call.taskId = options.taskId ?? null;
    call.host = base.host;
    call.model = {
      id: modelId,
      provider: inferProvider(modelId),
      effort: null,
    };
    call.usage = {
      input: nullableNumber(u.inputTokens),
      output: nullableNumber(u.outputTokens),
      cacheRead: nullableNumber(u.cacheReadInputTokens),
      cacheWrite: nullableNumber(u.cacheCreationInputTokens),
      reasoning: null,
      calls: null,
      apiRetries: null,
    };
    const basis = resolveClaudeJsonCostBasis(modelId, u);
    call.cost = {
      usd: nullableNumber(u.costUSD),
      basis,
      pricingVersion: null,
      isRealSpend: false,
    };
    call.source = { usage: 'cc-json', reliability: 'high' };
    events.push(call);
  }

  // run.end with aggregated totals from modelUsage (includes subagents).
  base.usage = {
    ...emptyUsage(),
    input: totals.input,
    output: totals.output,
    cacheRead: totals.cacheRead,
    cacheWrite: totals.cacheWrite,
    // -p JSON does not expose call / retry counts → null
    calls: null,
    apiRetries: null,
    reasoning: null,
  };
  const runBasis: CostBasis =
    totals.costUsd === null
      ? 'none'
      : entries.some(([id, u]) => resolveClaudeJsonCostBasis(id, u) === 'unknown')
        ? 'unknown'
        : 'host-estimate';
  base.cost = {
    usd: totals.costUsd,
    basis: runBasis,
    pricingVersion: null,
    isRealSpend: false,
  };
  // Seed is not documented for Claude Code → leave absent from event (schema has no seed field).
  events.push(base);

  return { events, totals, missing };
}

function inferProvider(
  modelId: string,
): 'anthropic' | 'openrouter' | 'openai' | 'other' {
  if (modelId.startsWith('claude') || modelId.startsWith('anthropic/')) return 'anthropic';
  if (modelId.includes('/')) return 'openrouter';
  if (modelId.startsWith('gpt-') || modelId.startsWith('o1') || modelId.startsWith('o3') || modelId.startsWith('o4')) {
    return 'openai';
  }
  return 'other';
}

/**
 * Claude Code's `costUSD` / `total_cost_usd` use Anthropic list prices.
 * For OpenRouter / non-Anthropic / `:free` routes that figure is not provider-billed
 * and not a faithful host-estimate of what was charged → `unknown`.
 */
export function resolveClaudeJsonCostBasis(
  modelId: string,
  entry?: ClaudeModelUsageEntry | null,
): CostBasis {
  if (entry?.costBasis === 'unknown') return 'unknown';
  const provider = inferProvider(modelId);
  if (provider === 'openrouter' || modelId.trim().endsWith(':free')) return 'unknown';
  if (provider !== 'anthropic') return 'unknown';
  return 'host-estimate';
}

/** Replay helper: totals from a fixture must equal modelUsage sums. */
export function modelUsageTotals(payload: unknown): {
  input: number | null;
  output: number | null;
  cacheRead: number | null;
  cacheWrite: number | null;
  costUsd: number | null;
} {
  const collected = collectClaudeJson(payload, { runId: 'replay' });
  return {
    input: collected.totals.input,
    output: collected.totals.output,
    cacheRead: collected.totals.cacheRead,
    cacheWrite: collected.totals.cacheWrite,
    costUsd: collected.totals.costUsd,
  };
}
