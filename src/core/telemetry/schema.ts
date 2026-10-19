/**
 * harness-telemetry/v1 — TypeScript mirror of schemas/harness-telemetry.v1.json.
 * Missing measurements are `null`, never `0`.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PACKAGE_ROOT } from '../presets/package-paths';

export const HARNESS_TELEMETRY_SCHEMA = 'harness-telemetry/v1' as const;
export const HARNESS_TELEMETRY_SCHEMA_PATH = resolve(
  PACKAGE_ROOT,
  'schemas',
  'harness-telemetry.v1.json',
);

export type HarnessName = 'codeconductor' | 'microsdd';
export type TelemetryEventName =
  | 'run.start'
  | 'run.end'
  | 'task.start'
  | 'task.end'
  | 'agent.end'
  | 'model.call'
  | 'verification'
  | 'retry'
  | 'iteration';

export type HostName = 'claude-code' | 'codex' | 'opencode' | 'openrouter-direct' | 'other';
export type HostMode = 'headless' | 'interactive';
export type ModelProvider = 'anthropic' | 'openrouter' | 'openai' | 'other';
export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type CostBasis =
  | 'provider-billed'
  | 'host-estimate'
  | 'pricing-table'
  | 'unknown'
  | 'none';
export type UsageSource =
  | 'cc-json'
  | 'cc-otel'
  | 'cc-transcript'
  | 'openrouter-usage'
  | 'codex-json'
  | 'harness'
  | 'none';
export type Reliability = 'high' | 'medium' | 'low';
export type PrivacyMode = 'standard' | 'strict';
export type OutcomeStatus = 'done' | 'failed' | 'escalated' | 'aborted';

export interface TelemetryUsage {
  input: number | null;
  output: number | null;
  cacheRead: number | null;
  cacheWrite: number | null;
  reasoning: number | null;
  calls: number | null;
  apiRetries: number | null;
}

export interface TelemetryCost {
  usd: number | null;
  basis: CostBasis | null;
  pricingVersion: string | null;
  isRealSpend: boolean | null;
}

export interface HarnessTelemetryEvent {
  schema: typeof HARNESS_TELEMETRY_SCHEMA;
  ts: string;
  harness: {
    name: HarnessName;
    version: string | null;
    commit: string | null;
    promptCompilerVersion: string | null;
    promptFingerprint: string | null;
  };
  runId: string;
  taskId: string | null;
  agent: { role: string | null; agentId: string | null } | null;
  event: TelemetryEventName;
  host: { name: HostName | null; version: string | null; mode: HostMode | null } | null;
  model: {
    id: string | null;
    provider: ModelProvider | null;
    effort: EffortLevel | null;
  } | null;
  usage: TelemetryUsage | null;
  cost: TelemetryCost | null;
  loop: {
    iteration: number | null;
    retryReason: string | null;
    maxIterations: number | null;
  } | null;
  verification: {
    gate: string | null;
    passed: boolean | null;
    durationMs: number | null;
  } | null;
  durationMs: number | null;
  outcome: { status: OutcomeStatus | null; firstTry: boolean | null } | null;
  source: { usage: UsageSource | null; reliability: Reliability | null } | null;
  privacy: PrivacyMode | null;
}

const EVENT_NAMES = new Set<string>([
  'run.start',
  'run.end',
  'task.start',
  'task.end',
  'agent.end',
  'model.call',
  'verification',
  'retry',
  'iteration',
]);

const HARNESS_NAMES = new Set<string>(['codeconductor', 'microsdd']);

export function emptyUsage(): TelemetryUsage {
  return {
    input: null,
    output: null,
    cacheRead: null,
    cacheWrite: null,
    reasoning: null,
    calls: null,
    apiRetries: null,
  };
}

export function emptyCost(): TelemetryCost {
  return {
    usd: null,
    basis: null,
    pricingVersion: null,
    isRealSpend: null,
  };
}

/** Coerce a missing measurement to null; never invent a zero. */
export function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

export function isHarnessTelemetryEvent(value: unknown): value is HarnessTelemetryEvent {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.schema !== HARNESS_TELEMETRY_SCHEMA) return false;
  if (typeof v.ts !== 'string' || v.ts.length === 0) return false;
  if (typeof v.runId !== 'string' || v.runId.length === 0) return false;
  if (typeof v.event !== 'string' || !EVENT_NAMES.has(v.event)) return false;
  if (v.harness === null || typeof v.harness !== 'object') return false;
  const harness = v.harness as Record<string, unknown>;
  if (typeof harness.name !== 'string' || !HARNESS_NAMES.has(harness.name)) return false;
  return true;
}

export function assertHarnessTelemetryEvent(value: unknown): HarnessTelemetryEvent {
  if (!isHarnessTelemetryEvent(value)) {
    throw new Error('Invalid harness-telemetry/v1 event');
  }
  return value;
}

export async function loadHarnessTelemetryJsonSchema(): Promise<unknown> {
  const raw = await readFile(HARNESS_TELEMETRY_SCHEMA_PATH, 'utf-8');
  return JSON.parse(raw) as unknown;
}

export function createBaseEvent(input: {
  runId: string;
  event: TelemetryEventName;
  harnessName?: HarnessName;
  harnessVersion?: string | null;
  harnessCommit?: string | null;
  ts?: string;
  privacy?: PrivacyMode | null;
}): HarnessTelemetryEvent {
  return {
    schema: HARNESS_TELEMETRY_SCHEMA,
    ts: input.ts ?? new Date().toISOString(),
    harness: {
      name: input.harnessName ?? 'codeconductor',
      version: input.harnessVersion ?? null,
      commit: input.harnessCommit ?? null,
      promptCompilerVersion: null,
      promptFingerprint: null,
    },
    runId: input.runId,
    taskId: null,
    agent: null,
    event: input.event,
    host: null,
    model: null,
    usage: null,
    cost: null,
    loop: null,
    verification: null,
    durationMs: null,
    outcome: null,
    source: null,
    privacy: input.privacy ?? 'standard',
  };
}
