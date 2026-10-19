/**
 * OpenRouter usage collector.
 * Prefer provider-billed `usage.cost`. Optional /api/v1/key delta (env key only).
 */
import {
  fetchOpenRouterKeySnapshot,
  readOpenRouterApiKeyFromEnv,
  type OpenRouterKeySnapshot,
} from '../openrouter-spend-lock';
import { createBaseEvent, emptyUsage, nullableNumber, type HarnessTelemetryEvent } from '../schema';

export interface OpenRouterUsageBlock {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost?: number;
  cost_details?: { upstream_inference_cost?: number };
  prompt_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
}

export interface OpenRouterGeneration {
  id?: string;
  model?: string;
  usage?: OpenRouterUsageBlock;
}

export interface CollectOpenRouterOptions {
  runId: string;
  taskId?: string | null;
  harnessVersion?: string | null;
  modelId?: string | null;
  ts?: string;
  privacy?: 'standard' | 'strict';
  /** Optional pre-run key snapshot for delta accounting. */
  keyBefore?: OpenRouterKeySnapshot | null;
  /** Optional post-run key snapshot. */
  keyAfter?: OpenRouterKeySnapshot | null;
}

export interface OpenRouterCollection {
  events: HarnessTelemetryEvent[];
  totals: {
    input: number | null;
    output: number | null;
    cacheRead: number | null;
    cacheWrite: number | null;
    reasoning: number | null;
    costUsd: number | null;
    keyDeltaUsd: number | null;
  };
}

function asGenerations(payload: unknown): OpenRouterGeneration[] {
  if (typeof payload === 'string') {
    try {
      return asGenerations(JSON.parse(payload) as unknown);
    } catch {
      return [];
    }
  }
  if (Array.isArray(payload)) return payload as OpenRouterGeneration[];
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    if (obj.usage || obj.model) return [payload as OpenRouterGeneration];
    if (Array.isArray(obj.data)) return obj.data as OpenRouterGeneration[];
    if (Array.isArray(obj.generations)) return obj.generations as OpenRouterGeneration[];
  }
  return [];
}

/**
 * Capture a key snapshot for delta accounting. Returns null without a key.
 * Never writes the key anywhere.
 */
export async function captureOpenRouterKeyDeltaAnchor(
  fetchImpl?: typeof fetch,
): Promise<OpenRouterKeySnapshot | null> {
  if (!readOpenRouterApiKeyFromEnv()) return null;
  return fetchOpenRouterKeySnapshot({ fetchImpl });
}

export function keyUsageDelta(
  before: OpenRouterKeySnapshot | null | undefined,
  after: OpenRouterKeySnapshot | null | undefined,
): number | null {
  if (!before || !after) return null;
  if (before.usage === null || after.usage === null) return null;
  return after.usage - before.usage;
}

export function collectOpenRouter(
  payload: unknown,
  options: CollectOpenRouterOptions,
): OpenRouterCollection {
  const gens = asGenerations(payload);
  let input: number | null = null;
  let output: number | null = null;
  let cacheRead: number | null = null;
  let cacheWrite: number | null = null;
  let reasoning: number | null = null;
  let costUsd: number | null = null;

  const modelCalls: HarnessTelemetryEvent[] = [];

  for (const gen of gens) {
    const usage = gen.usage;
    if (!usage) continue;

    const inTok = nullableNumber(usage.prompt_tokens);
    const outTok = nullableNumber(usage.completion_tokens);
    const cached = nullableNumber(usage.prompt_tokens_details?.cached_tokens);
    const cacheW = nullableNumber(usage.prompt_tokens_details?.cache_write_tokens);
    const reason = nullableNumber(usage.completion_tokens_details?.reasoning_tokens);
    const cost = nullableNumber(usage.cost);

    if (inTok !== null) input = (input ?? 0) + inTok;
    if (outTok !== null) output = (output ?? 0) + outTok;
    if (cached !== null) cacheRead = (cacheRead ?? 0) + cached;
    if (cacheW !== null) cacheWrite = (cacheWrite ?? 0) + cacheW;
    if (reason !== null) reasoning = (reasoning ?? 0) + reason;
    if (cost !== null) costUsd = (costUsd ?? 0) + cost;

    const call = createBaseEvent({
      runId: options.runId,
      event: 'model.call',
      harnessVersion: options.harnessVersion ?? null,
      ts: options.ts,
      privacy: options.privacy ?? 'standard',
    });
    call.taskId = options.taskId ?? null;
    call.host = { name: 'openrouter-direct', version: null, mode: 'headless' };
    call.model = {
      id: options.modelId ?? (typeof gen.model === 'string' ? gen.model : null),
      provider: 'openrouter',
      effort: null,
    };
    call.usage = {
      ...emptyUsage(),
      input: inTok,
      output: outTok,
      cacheRead: cached,
      cacheWrite: cacheW,
      reasoning: reason,
      calls: 1,
      apiRetries: null,
    };
    call.cost = {
      usd: cost,
      basis: cost === null ? 'none' : 'provider-billed',
      pricingVersion: null,
      isRealSpend: cost !== null,
    };
    call.source = { usage: 'openrouter-usage', reliability: 'high' };
    modelCalls.push(call);
  }

  const keyDeltaUsd = keyUsageDelta(options.keyBefore, options.keyAfter);
  // Prefer provider-billed usage.cost; key delta is corroboration / fallback.
  const effectiveCost = costUsd !== null ? costUsd : keyDeltaUsd;

  const runEnd = createBaseEvent({
    runId: options.runId,
    event: 'run.end',
    harnessVersion: options.harnessVersion ?? null,
    ts: options.ts,
    privacy: options.privacy ?? 'standard',
  });
  runEnd.taskId = options.taskId ?? null;
  runEnd.host = { name: 'openrouter-direct', version: null, mode: 'headless' };
  runEnd.model = {
    id: options.modelId ?? null,
    provider: 'openrouter',
    effort: null,
  };
  runEnd.usage = {
    ...emptyUsage(),
    input,
    output,
    cacheRead,
    cacheWrite,
    reasoning,
    calls: modelCalls.length > 0 ? modelCalls.length : null,
    apiRetries: null,
  };
  runEnd.cost = {
    usd: effectiveCost,
    basis:
      costUsd !== null
        ? 'provider-billed'
        : keyDeltaUsd !== null
          ? 'provider-billed'
          : 'none',
    pricingVersion: null,
    isRealSpend: effectiveCost !== null,
  };
  runEnd.source = { usage: 'openrouter-usage', reliability: 'high' };

  return {
    events: [...modelCalls, runEnd],
    totals: {
      input,
      output,
      cacheRead,
      cacheWrite,
      reasoning,
      costUsd: effectiveCost,
      keyDeltaUsd,
    },
  };
}
