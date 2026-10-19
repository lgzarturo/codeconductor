/**
 * Transcript JSONL backup collector.
 * Deduplicate by message.id; keep input + cache; output is always null
 * (per-step output_tokens is a placeholder — cost-tracking docs).
 * Reliability: low.
 */
import { createBaseEvent, emptyUsage, nullableNumber, type HarnessTelemetryEvent } from '../schema';

export interface TranscriptUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read?: number;
  cache_creation?: number;
}

export interface TranscriptMessage {
  id?: string;
  usage?: TranscriptUsage;
  role?: string;
}

export interface TranscriptLine {
  type?: string;
  message?: TranscriptMessage;
  uuid?: string;
  usage?: TranscriptUsage;
}

export interface CollectTranscriptOptions {
  runId: string;
  taskId?: string | null;
  harnessVersion?: string | null;
  agentRole?: string | null;
  agentId?: string | null;
  ts?: string;
  privacy?: 'standard' | 'strict';
}

export interface TranscriptCollection {
  events: HarnessTelemetryEvent[];
  totals: {
    input: number | null;
    output: null;
    cacheRead: number | null;
    cacheWrite: number | null;
    uniqueMessages: number;
  };
  /** message.ids that contributed (for debugging; not persisted to events). */
  seenIds: string[];
}

function parseLines(raw: string): TranscriptLine[] {
  const out: TranscriptLine[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as TranscriptLine);
    } catch {
      // skip malformed lines — transcript format is internal / versioned
    }
  }
  return out;
}

function messageId(line: TranscriptLine): string | null {
  const id = line.message?.id ?? line.uuid;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

function usageOf(line: TranscriptLine): TranscriptUsage | null {
  return line.message?.usage ?? line.usage ?? null;
}

/**
 * Collect usage from a Claude Code transcript JSONL string or parsed lines.
 * Output tokens are forced to null.
 */
export function collectClaudeTranscript(
  payload: string | TranscriptLine[],
  options: CollectTranscriptOptions,
): TranscriptCollection {
  const lines = typeof payload === 'string' ? parseLines(payload) : payload;
  const seen = new Set<string>();
  const seenIds: string[] = [];
  let input: number | null = null;
  let cacheRead: number | null = null;
  let cacheWrite: number | null = null;

  for (const line of lines) {
    const id = messageId(line);
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    seenIds.push(id);

    const usage = usageOf(line);
    if (!usage) continue;

    const inTok = nullableNumber(usage.input_tokens);
    const cr = nullableNumber(usage.cache_read_input_tokens ?? usage.cache_read);
    const cw = nullableNumber(usage.cache_creation_input_tokens ?? usage.cache_creation);

    if (inTok !== null) input = (input ?? 0) + inTok;
    if (cr !== null) cacheRead = (cacheRead ?? 0) + cr;
    if (cw !== null) cacheWrite = (cacheWrite ?? 0) + cw;
  }

  const event = createBaseEvent({
    runId: options.runId,
    event: 'run.end',
    harnessVersion: options.harnessVersion ?? null,
    ts: options.ts,
    privacy: options.privacy ?? 'standard',
  });
  event.taskId = options.taskId ?? null;
  event.agent = {
    role: options.agentRole ?? null,
    agentId: options.agentId ?? null,
  };
  event.host = { name: 'claude-code', version: null, mode: null };
  event.usage = {
    ...emptyUsage(),
    input,
    output: null,
    cacheRead,
    cacheWrite,
    reasoning: null,
    calls: null,
    apiRetries: null,
  };
  event.cost = {
    usd: null,
    basis: 'none',
    pricingVersion: null,
    isRealSpend: false,
  };
  event.source = { usage: 'cc-transcript', reliability: 'low' };

  return {
    events: [event],
    totals: {
      input,
      output: null,
      cacheRead,
      cacheWrite,
      uniqueMessages: seenIds.length,
    },
    seenIds,
  };
}
