/**
 * Local OTLP http/json receiver for Claude Code telemetry (loopback only).
 * Parses log records into harness-telemetry model.call events.
 */
import { createBaseEvent, emptyUsage, nullableNumber, type HarnessTelemetryEvent } from '../schema';

export interface OtlpReceiverOptions {
  host?: string;
  port?: number;
  /** Called for each parsed harness event (optional live sink). */
  onEvents?: (events: HarnessTelemetryEvent[]) => void | Promise<void>;
  runId?: string;
}

export interface OtlpReceiver {
  readonly host: string;
  readonly port: number;
  readonly endpoint: string;
  readonly events: HarnessTelemetryEvent[];
  stop(): Promise<void>;
}

export interface CollectClaudeOtelOptions {
  runId: string;
  taskId?: string | null;
  harnessVersion?: string | null;
  ts?: string;
  privacy?: 'standard' | 'strict';
}

type AnyRecord = Record<string, unknown>;

function asRecord(value: unknown): AnyRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as AnyRecord)
    : null;
}

function attrMap(
  attrs: unknown,
): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  if (!Array.isArray(attrs)) return out;
  for (const item of attrs) {
    const a = asRecord(item);
    if (!a || typeof a.key !== 'string') continue;
    const v = asRecord(a.value) ?? {};
    if (typeof v.stringValue === 'string') out[a.key] = v.stringValue;
    else if (typeof v.intValue === 'number' || typeof v.intValue === 'string') {
      out[a.key] = Number(v.intValue);
    } else if (typeof v.doubleValue === 'number') out[a.key] = v.doubleValue;
    else if (typeof v.boolValue === 'boolean') out[a.key] = v.boolValue;
  }
  return out;
}

/**
 * Parse an OTLP/HTTP JSON ExportLogsServiceRequest body into telemetry events.
 */
export function parseOtlpLogsPayload(
  body: unknown,
  options: CollectClaudeOtelOptions,
): HarnessTelemetryEvent[] {
  const root = asRecord(body);
  if (!root) return [];
  const resourceLogs = Array.isArray(root.resourceLogs) ? root.resourceLogs : [];
  const events: HarnessTelemetryEvent[] = [];

  for (const rl of resourceLogs) {
    const scopeLogs = Array.isArray(asRecord(rl)?.scopeLogs)
      ? (asRecord(rl)!.scopeLogs as unknown[])
      : [];
    for (const sl of scopeLogs) {
      const logRecords = Array.isArray(asRecord(sl)?.logRecords)
        ? (asRecord(sl)!.logRecords as unknown[])
        : [];
      for (const lr of logRecords) {
        const rec = asRecord(lr);
        if (!rec) continue;
        const attrs = attrMap(rec.attributes);
        const eventName =
          (typeof attrs['event.name'] === 'string' && attrs['event.name']) ||
          (typeof attrs.event_name === 'string' && attrs.event_name) ||
          (typeof rec.body === 'object' &&
            !!asRecord(rec.body)?.stringValue &&
            String(asRecord(rec.body)!.stringValue)) ||
          '';

        // Claude Code api_request log → one model.call
        if (
          eventName === 'claude_code.api_request' ||
          eventName.includes('api_request') ||
          attrs.input_tokens !== undefined ||
          attrs.output_tokens !== undefined
        ) {
          events.push(modelCallFromAttrs(attrs, options));
        }
      }
    }
  }
  return events;
}

function modelCallFromAttrs(
  attrs: Record<string, string | number | boolean | null>,
  options: CollectClaudeOtelOptions,
): HarnessTelemetryEvent {
  const agentName =
    typeof attrs['agent.name'] === 'string'
      ? attrs['agent.name']
      : typeof attrs['agent_name'] === 'string'
        ? attrs['agent_name']
        : null;

  const event = createBaseEvent({
    runId: options.runId,
    event: 'model.call',
    harnessVersion: options.harnessVersion ?? null,
    ts: options.ts,
    privacy: options.privacy ?? 'standard',
  });
  event.taskId = options.taskId ?? null;
  event.host = { name: 'claude-code', version: null, mode: null };
  event.agent = {
    role: agentName,
    agentId: typeof attrs.agent_id === 'string' ? attrs.agent_id : null,
  };
  event.model = {
    id: typeof attrs.model === 'string' ? attrs.model : null,
    provider: 'anthropic',
    effort:
      typeof attrs.effort === 'string' &&
      ['low', 'medium', 'high', 'xhigh', 'max'].includes(attrs.effort)
        ? (attrs.effort as 'low' | 'medium' | 'high' | 'xhigh' | 'max')
        : null,
  };
  event.usage = {
    ...emptyUsage(),
    input: nullableNumber(attrs.input_tokens),
    output: nullableNumber(attrs.output_tokens),
    cacheRead: nullableNumber(attrs.cache_read_tokens ?? attrs.cache_read_input_tokens),
    cacheWrite: nullableNumber(
      attrs.cache_creation_tokens ?? attrs.cache_creation_input_tokens,
    ),
    reasoning: null,
    calls: 1,
    apiRetries: nullableNumber(attrs.attempt) !== null ? Math.max(0, Number(attrs.attempt) - 1) : null,
  };
  const cost = nullableNumber(attrs.cost_usd);
  event.cost = {
    usd: cost,
    basis: cost === null ? 'none' : 'host-estimate',
    pricingVersion: null,
    isRealSpend: false,
  };
  event.durationMs = nullableNumber(attrs.duration_ms);
  event.source = { usage: 'cc-otel', reliability: 'high' };
  return event;
}

/**
 * Start a Bun.serve OTLP http/json receiver bound to 127.0.0.1 only.
 */
export async function startClaudeOtelReceiver(
  options: OtlpReceiverOptions = {},
): Promise<OtlpReceiver> {
  const host = '127.0.0.1';
  if (options.host && options.host !== '127.0.0.1' && options.host !== 'localhost') {
    throw new Error('OTLP receiver must bind to 127.0.0.1 only (privacy §7)');
  }
  const port = options.port ?? 4318;
  const runId = options.runId ?? `r-otel-${Date.now().toString(36)}`;
  const collected: HarnessTelemetryEvent[] = [];

  // Bun global — available under `bun test` / `bun run`.
  const server = Bun.serve({
    hostname: host,
    port,
    async fetch(req) {
      const url = new URL(req.url);
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
        return Response.json({ ok: true, endpoint: `http://${host}:${port}` });
      }
      if (req.method !== 'POST') {
        return new Response('method not allowed', { status: 405 });
      }

      // Accept common OTLP HTTP paths
      const path = url.pathname;
      if (
        !path.endsWith('/v1/logs') &&
        !path.endsWith('/v1/metrics') &&
        !path.endsWith('/v1/traces') &&
        path !== '/'
      ) {
        return new Response('not found', { status: 404 });
      }

      let body: unknown = null;
      try {
        body = await req.json();
      } catch {
        return new Response('invalid json', { status: 400 });
      }

      if (path.endsWith('/v1/logs') || path === '/') {
        const events = parseOtlpLogsPayload(body, { runId });
        collected.push(...events);
        if (options.onEvents && events.length > 0) {
          await options.onEvents(events);
        }
      }
      // metrics/traces accepted and dropped (no content logged)
      return new Response(null, { status: 200 });
    },
  });

  return {
    host,
    port: server.port ?? port,
    endpoint: `http://${host}:${server.port}`,
    events: collected,
    async stop() {
      server.stop(true);
    },
  };
}

/** Aggregate OTLP-derived model.call events into totals (for Δ checks). */
export function otelTotals(events: HarnessTelemetryEvent[]): {
  input: number | null;
  output: number | null;
  cacheRead: number | null;
  cacheWrite: number | null;
  costUsd: number | null;
  calls: number;
} {
  let input: number | null = null;
  let output: number | null = null;
  let cacheRead: number | null = null;
  let cacheWrite: number | null = null;
  let costUsd: number | null = null;
  let calls = 0;
  for (const e of events) {
    if (e.event !== 'model.call') continue;
    calls++;
    if (e.usage?.input != null) input = (input ?? 0) + e.usage.input;
    if (e.usage?.output != null) output = (output ?? 0) + e.usage.output;
    if (e.usage?.cacheRead != null) cacheRead = (cacheRead ?? 0) + e.usage.cacheRead;
    if (e.usage?.cacheWrite != null) cacheWrite = (cacheWrite ?? 0) + e.usage.cacheWrite;
    if (e.cost?.usd != null) costUsd = (costUsd ?? 0) + e.cost.usd;
  }
  return { input, output, cacheRead, cacheWrite, costUsd, calls };
}
