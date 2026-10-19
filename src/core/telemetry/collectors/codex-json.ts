/**
 * Collector for `codex exec --json` turn.completed.usage events.
 */
import { createBaseEvent, emptyUsage, nullableNumber, type HarnessTelemetryEvent } from '../schema';

export interface CodexTurnUsage {
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
  reasoning_output_tokens?: number;
}

export interface CodexJsonEvent {
  type?: string;
  usage?: CodexTurnUsage;
  [key: string]: unknown;
}

export interface CollectCodexJsonOptions {
  runId: string;
  taskId?: string | null;
  harnessVersion?: string | null;
  hostVersion?: string | null;
  modelId?: string | null;
  ts?: string;
  privacy?: 'standard' | 'strict';
}

export interface CodexJsonCollection {
  events: HarnessTelemetryEvent[];
  totals: {
    input: number | null;
    output: number | null;
    cacheRead: number | null;
    cacheWrite: null;
    reasoning: number | null;
    turns: number;
  };
}

function parsePayload(payload: unknown): CodexJsonEvent[] {
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (!trimmed) return [];
    // NDJSON or single JSON
    if (trimmed.startsWith('[')) {
      try {
        const arr = JSON.parse(trimmed) as unknown;
        return Array.isArray(arr) ? (arr as CodexJsonEvent[]) : [];
      } catch {
        return [];
      }
    }
    const events: CodexJsonEvent[] = [];
    for (const line of trimmed.split('\n')) {
      if (!line.trim()) continue;
      try {
        events.push(JSON.parse(line) as CodexJsonEvent);
      } catch {
        /* skip */
      }
    }
    return events;
  }
  if (Array.isArray(payload)) return payload as CodexJsonEvent[];
  if (payload && typeof payload === 'object') return [payload as CodexJsonEvent];
  return [];
}

export function collectCodexJson(
  payload: unknown,
  options: CollectCodexJsonOptions,
): CodexJsonCollection {
  const eventsIn = parsePayload(payload);
  let input: number | null = null;
  let output: number | null = null;
  let cacheRead: number | null = null;
  let reasoning: number | null = null;
  let turns = 0;

  const modelCalls: HarnessTelemetryEvent[] = [];

  for (const ev of eventsIn) {
    if (ev.type !== 'turn.completed' && ev.type !== 'item.completed') continue;
    const usage = ev.usage;
    if (!usage || typeof usage !== 'object') continue;
    turns++;

    const inTok = nullableNumber(usage.input_tokens);
    const cached = nullableNumber(usage.cached_input_tokens);
    const outTok = nullableNumber(usage.output_tokens);
    const reason = nullableNumber(usage.reasoning_output_tokens);

    if (inTok !== null) input = (input ?? 0) + inTok;
    if (cached !== null) cacheRead = (cacheRead ?? 0) + cached;
    if (outTok !== null) output = (output ?? 0) + outTok;
    if (reason !== null) reasoning = (reasoning ?? 0) + reason;

    const call = createBaseEvent({
      runId: options.runId,
      event: 'model.call',
      harnessVersion: options.harnessVersion ?? null,
      ts: options.ts,
      privacy: options.privacy ?? 'standard',
    });
    call.taskId = options.taskId ?? null;
    call.host = {
      name: 'codex',
      version: options.hostVersion ?? null,
      mode: 'headless',
    };
    call.model = {
      id: options.modelId ?? null,
      provider: 'openai',
      effort: null,
    };
    call.usage = {
      ...emptyUsage(),
      input: inTok,
      output: outTok,
      cacheRead: cached,
      cacheWrite: null,
      reasoning: reason,
      calls: 1,
      apiRetries: null,
    };
    call.cost = {
      usd: null,
      basis: 'none',
      pricingVersion: null,
      isRealSpend: false,
    };
    call.source = { usage: 'codex-json', reliability: 'high' };
    modelCalls.push(call);
  }

  const runEnd = createBaseEvent({
    runId: options.runId,
    event: 'run.end',
    harnessVersion: options.harnessVersion ?? null,
    ts: options.ts,
    privacy: options.privacy ?? 'standard',
  });
  runEnd.taskId = options.taskId ?? null;
  runEnd.host = {
    name: 'codex',
    version: options.hostVersion ?? null,
    mode: 'headless',
  };
  runEnd.usage = {
    ...emptyUsage(),
    input,
    output,
    cacheRead,
    cacheWrite: null,
    reasoning,
    calls: turns > 0 ? turns : null,
    apiRetries: null,
  };
  runEnd.cost = {
    usd: null,
    basis: 'none',
    pricingVersion: null,
    isRealSpend: false,
  };
  runEnd.source = { usage: 'codex-json', reliability: 'high' };

  return {
    events: [...modelCalls, runEnd],
    totals: {
      input,
      output,
      cacheRead,
      cacheWrite: null,
      reasoning,
      turns,
    },
  };
}
