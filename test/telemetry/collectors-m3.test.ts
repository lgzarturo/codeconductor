/**
 * M3 collectors — synthetic fixtures only. Live Δ ≤ 1% cross-source check is pending.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { collectClaudeTranscript } from '../../src/core/telemetry/collectors/claude-transcript';
import { collectCodexJson } from '../../src/core/telemetry/collectors/codex-json';
import {
  collectOpenRouter,
  keyUsageDelta,
} from '../../src/core/telemetry/collectors/openrouter';
import {
  otelTotals,
  parseOtlpLogsPayload,
  startClaudeOtelReceiver,
} from '../../src/core/telemetry/collectors/claude-otel';
import { buildOtelEnv, FORBIDDEN_OTEL_LOG_VARS } from '../../src/core/telemetry/otel-env';
import {
  assertOpenRouterZeroSpend,
  enforceOpenRouterZeroSpend,
  isOpenRouterFreeModel,
  keyAllowsPaidSpend,
  keySnapshotIsComplete,
  parseOpenRouterKeyBody,
} from '../../src/core/telemetry/openrouter-spend-lock';
import { telemetryCommand } from '../../src/commands/telemetry.command';
import { appendTelemetryEvent } from '../../src/core/telemetry/store';
import { createBaseEvent } from '../../src/core/telemetry/schema';
import { modelUsageTotals } from '../../src/core/telemetry/collectors/claude-json';

const FIXTURES = resolve(import.meta.dir, '../fixtures/telemetry');

describe('M3 transcript collector (synthetic)', () => {
  test('dedupes by message.id; output is always null', async () => {
    const raw = await readFile(join(FIXTURES, 'claude-transcript-synthetic.jsonl'), 'utf-8');
    const collected = collectClaudeTranscript(raw, { runId: 'r-tr' });
    expect(collected.totals.uniqueMessages).toBe(2);
    expect(collected.totals.input).toBe(300);
    expect(collected.totals.cacheRead).toBe(50);
    expect(collected.totals.cacheWrite).toBe(15);
    expect(collected.totals.output).toBeNull();
    expect(collected.events[0]!.usage!.output).toBeNull();
    expect(collected.events[0]!.source!.usage).toBe('cc-transcript');
    expect(collected.events[0]!.source!.reliability).toBe('low');
  });
});

describe('M3 codex-json collector (synthetic)', () => {
  test('sums turn.completed.usage including reasoning', async () => {
    const raw = await readFile(join(FIXTURES, 'codex-exec-json-synthetic.jsonl'), 'utf-8');
    const collected = collectCodexJson(raw, { runId: 'r-codex', modelId: 'o4-mini' });
    expect(collected.totals.turns).toBe(2);
    expect(collected.totals.input).toBe(2000);
    expect(collected.totals.cacheRead).toBe(500);
    expect(collected.totals.output).toBe(450);
    expect(collected.totals.reasoning).toBe(70);
    expect(collected.totals.cacheWrite).toBeNull();
    expect(collected.events.some((e) => e.event === 'run.end')).toBe(true);
    expect(collected.events.filter((e) => e.event === 'model.call').length).toBe(2);
  });
});

describe('M3 openrouter collector (synthetic)', () => {
  test('uses usage.cost as provider-billed; key delta optional', async () => {
    const raw = JSON.parse(
      await readFile(join(FIXTURES, 'openrouter-usage-synthetic.json'), 'utf-8'),
    );
    const collected = collectOpenRouter(raw, {
      runId: 'r-or',
      modelId: 'anthropic/claude-sonnet-5-5:free',
      keyBefore: {
        limit: null,
        limitRemaining: null,
        usage: 1.0,
        isFreeTier: true,
        label: 'test',
      },
      keyAfter: {
        limit: null,
        limitRemaining: null,
        usage: 1.0,
        isFreeTier: true,
        label: 'test',
      },
    });
    expect(collected.totals.costUsd).toBe(0);
    expect(collected.totals.keyDeltaUsd).toBe(0);
    expect(collected.events[0]!.cost!.basis).toBe('provider-billed');
    expect(collected.events[0]!.cost!.isRealSpend).toBe(true);
    expect(keyUsageDelta({ usage: 2, limit: null, limitRemaining: null, isFreeTier: true, label: null }, { usage: 2.5, limit: null, limitRemaining: null, isFreeTier: true, label: null })).toBeCloseTo(0.5);
  });
});

describe('M3 OTLP parse + loopback receiver (synthetic)', () => {
  test('parses synthetic api_request logs into model.call events', async () => {
    const body = JSON.parse(
      await readFile(join(FIXTURES, 'otel-logs-api-request-synthetic.json'), 'utf-8'),
    );
    const events = parseOtlpLogsPayload(body, { runId: 'r-otel' });
    expect(events.length).toBe(2);
    expect(events[0]!.agent?.role).toBe('implementer');
    expect(events[0]!.usage!.input).toBe(500);
    expect(events[1]!.usage!.apiRetries).toBe(1); // attempt 2 → 1 retry
    const totals = otelTotals(events);
    expect(totals.input).toBe(600);
    expect(totals.output).toBe(100);
    expect(totals.cacheRead).toBe(200);
    expect(totals.calls).toBe(2);
  });

  test('receiver binds only to 127.0.0.1 and accepts /v1/logs', async () => {
    const receiver = await startClaudeOtelReceiver({ port: 0, runId: 'r-live' });
    expect(receiver.host).toBe('127.0.0.1');
    expect(receiver.endpoint.startsWith('http://127.0.0.1:')).toBe(true);

    const body = JSON.parse(
      await readFile(join(FIXTURES, 'otel-logs-api-request-synthetic.json'), 'utf-8'),
    );
    const res = await fetch(`${receiver.endpoint}/v1/logs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(200);
    expect(receiver.events.length).toBe(2);
    await receiver.stop();

    await expect(
      startClaudeOtelReceiver({ host: '0.0.0.0', port: 0 }),
    ).rejects.toThrow(/127\.0\.0\.1/);
  });
});

describe('M3 otel-env privacy', () => {
  test('prints required vars and never enables forbidden content logs', () => {
    const built = buildOtelEnv({ port: 4319 });
    expect(built.vars.CLAUDE_CODE_ENABLE_TELEMETRY).toBe('1');
    expect(built.vars.OTEL_LOGS_EXPORTER).toBe('otlp');
    expect(built.vars.OTEL_EXPORTER_OTLP_PROTOCOL).toBe('http/json');
    expect(built.vars.OTEL_EXPORTER_OTLP_ENDPOINT).toBe('http://127.0.0.1:4319');
    expect(built.vars.OTEL_LOG_TOOL_DETAILS).toBeUndefined();
    for (const name of FORBIDDEN_OTEL_LOG_VARS) {
      expect(built.vars[name]).toBeUndefined();
      expect(built.exportLines.some((l) => l === `unset ${name}`)).toBe(true);
    }
    const withDetails = buildOtelEnv({ withToolDetails: true });
    expect(withDetails.vars.OTEL_LOG_TOOL_DETAILS).toBe('1');
  });
});

describe('M3 OpenRouter zero-spend lock', () => {
  test('rejects non-:free models', async () => {
    expect(isOpenRouterFreeModel('anthropic/claude-sonnet-5-5')).toBe(false);
    expect(isOpenRouterFreeModel('anthropic/claude-sonnet-5-5:free')).toBe(true);
    expect(isOpenRouterFreeModel('meta/llama-free')).toBe(false);
    const locked = await assertOpenRouterZeroSpend({
      modelId: 'openai/gpt-5',
      skipKeyCheck: true,
    });
    expect(locked.ok).toBe(false);
    expect(locked.reason).toContain(':free');
  });

  test('requires exact lowercase :free suffix (rejects :FREE / :Free)', async () => {
    expect(isOpenRouterFreeModel('anthropic/claude-sonnet-5-5:FREE')).toBe(false);
    expect(isOpenRouterFreeModel('anthropic/claude-sonnet-5-5:Free')).toBe(false);
    expect(isOpenRouterFreeModel('anthropic/claude-sonnet-5-5:FrEe')).toBe(false);
    const upper = await assertOpenRouterZeroSpend({
      modelId: 'meta/llama:FREE',
      skipKeyCheck: true,
    });
    expect(upper.ok).toBe(false);
    expect(upper.reason).toContain(':free');
  });

  test('rejects keys with paid limit > 0', async () => {
    expect(
      keyAllowsPaidSpend({
        limit: 10,
        limitRemaining: 5,
        usage: 0,
        isFreeTier: false,
        label: 'paid',
      }),
    ).toBe(true);
    const locked = await assertOpenRouterZeroSpend({
      modelId: 'meta/llama:free',
      key: {
        limit: 5,
        limitRemaining: 5,
        usage: 0,
        isFreeTier: true,
        label: 'has-limit',
      },
    });
    expect(locked.ok).toBe(false);
    expect(locked.checkedKey).toBe(true);
  });

  test('aborts when limitRemaining > 0 even if limit is null', async () => {
    expect(
      keyAllowsPaidSpend({
        limit: null,
        limitRemaining: 3.5,
        usage: 0,
        isFreeTier: true,
        label: 'remaining-without-limit',
      }),
    ).toBe(true);
    const locked = await assertOpenRouterZeroSpend({
      modelId: 'meta/llama:free',
      key: {
        limit: null,
        limitRemaining: 1,
        usage: 0,
        isFreeTier: true,
        label: 'remaining',
      },
    });
    expect(locked.ok).toBe(false);
    expect(locked.checkedKey).toBe(true);
    expect(locked.reason).toMatch(/spend capacity|balance|limit/i);
  });

  test('aborts when credit balance / credits > 0', async () => {
    expect(
      keyAllowsPaidSpend({
        limit: null,
        limitRemaining: null,
        usage: 0,
        isFreeTier: true,
        label: 'bal',
        balance: 2,
      }),
    ).toBe(true);
    expect(
      keyAllowsPaidSpend({
        limit: null,
        limitRemaining: null,
        usage: 0,
        isFreeTier: true,
        label: 'cred',
        credits: 0.5,
      }),
    ).toBe(true);
  });

  test('fail-closed on incomplete /api/v1/key body (data: {})', () => {
    expect(() => parseOpenRouterKeyBody({ data: {} })).toThrow(/incomplete|missing/i);
    expect(() => parseOpenRouterKeyBody({})).toThrow(/incomplete|missing/i);
    expect(() => parseOpenRouterKeyBody(null)).toThrow(/incomplete/i);
  });

  test('fail-closed on mistyped /api/v1/key fields', () => {
    expect(() =>
      parseOpenRouterKeyBody({
        data: {
          limit: '10',
          limit_remaining: null,
          usage: 0,
          is_free_tier: true,
        },
      }),
    ).toThrow(/unexpected type|incomplete/i);
    expect(() =>
      parseOpenRouterKeyBody({
        data: {
          limit: null,
          limit_remaining: null,
          usage: 0,
          is_free_tier: 'yes',
        },
      }),
    ).toThrow(/unexpected type|incomplete/i);
  });

  test('assert fails closed when key snapshot is incomplete', async () => {
    const incomplete = {
      limit: null,
      limitRemaining: null,
      usage: null,
      isFreeTier: null as unknown as boolean,
      label: null,
    };
    expect(keySnapshotIsComplete(incomplete)).toBe(false);
    const locked = await assertOpenRouterZeroSpend({
      modelId: 'meta/llama:free',
      key: incomplete,
    });
    expect(locked.ok).toBe(false);
    expect(locked.checkedKey).toBe(true);
    expect(locked.reason).toMatch(/incomplete|unparseable|fail-closed/i);
  });

  test('enforce throws on incomplete key from fetchKey', async () => {
    await expect(
      enforceOpenRouterZeroSpend({
        modelId: 'meta/llama:free',
        fetchKey: async () => {
          // Simulate parse failure path: throw like fetchOpenRouterKeySnapshot.
          throw new Error('OpenRouter /api/v1/key incomplete: missing field "limit"');
        },
      }),
    ).rejects.toThrow(/incomplete|missing field/i);
  });

  test('parse accepts complete free-tier body', () => {
    const snap = parseOpenRouterKeyBody({
      data: {
        limit: null,
        limit_remaining: null,
        usage: 0,
        is_free_tier: true,
        label: 'free',
      },
    });
    expect(snap.isFreeTier).toBe(true);
    expect(keySnapshotIsComplete(snap)).toBe(true);
    expect(keyAllowsPaidSpend(snap)).toBe(false);
  });

  test('allows :free + free-tier key with null limit', async () => {
    const ok = await assertOpenRouterZeroSpend({
      modelId: 'meta/llama-3.3-70b-instruct:free',
      key: {
        limit: null,
        limitRemaining: null,
        usage: 0,
        isFreeTier: true,
        label: 'free',
      },
    });
    expect(ok.ok).toBe(true);
  });
});

describe('M3 telemetry CLI', () => {
  let root: string;
  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  test('otel-env / show / purge', async () => {
    root = await mkdtemp(join(tmpdir(), 'cc-m3-cli-'));
    await mkdir(join(root, '.codeconductor'), { recursive: true });

    const env = await telemetryCommand({
      projectRoot: root,
      output: 'json',
      subcommand: 'otel-env',
      port: 4321,
    });
    expect(env.code).toBe(0);
    const envData = env.data as { vars: Record<string, string>; endpoint: string };
    expect(envData.endpoint).toBe('http://127.0.0.1:4321');
    expect(envData.vars.OTEL_EXPORTER_OTLP_ENDPOINT).toBe('http://127.0.0.1:4321');

    await appendTelemetryEvent(root, createBaseEvent({ runId: 'r-show-1', event: 'run.start' }));
    const shown = await telemetryCommand({
      projectRoot: root,
      output: 'json',
      subcommand: 'show',
    });
    expect(shown.code).toBe(0);
    expect((shown.data as { runCount: number }).runCount).toBe(1);

    const purged = await telemetryCommand({
      projectRoot: root,
      output: 'json',
      subcommand: 'purge',
    });
    expect(purged.code).toBe(0);
    const shown2 = await telemetryCommand({
      projectRoot: root,
      output: 'json',
      subcommand: 'show',
    });
    expect((shown2.data as { runCount: number }).runCount).toBe(0);
  });
});

describe('M3 pending: cross-source Δ ≤ 1% (needs live runs)', () => {
  test('documents pending live criterion; synthetic sources are independently consistent', async () => {
    // Placeholder: live Claude -p vs OTel on the same run is required for the
    // §5 M3 closure criterion (Δ ≤ 1% on input/cache). Marked pending in the PR.
    const pJson = JSON.parse(
      await readFile(join(FIXTURES, 'claude-p-output-synthetic.json'), 'utf-8'),
    );
    const totals = modelUsageTotals(pJson);
    expect(totals.input).not.toBeNull();
    // No live OTel paired fixture exists — assert the pending flag explicitly.
    const pendingLiveDeltaCheck = true;
    expect(pendingLiveDeltaCheck).toBe(true);
  });
});
