/**
 * Replay tests for the Claude Code -p JSON collector (M1 closure).
 */
import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  collectClaudeJson,
  modelUsageTotals,
} from '../../src/core/telemetry/collectors/claude-json';

const FIXTURES = resolve(import.meta.dir, '../fixtures/telemetry');

describe('collectClaudeJson — synthetic fixture replay', () => {
  test('replay totals match modelUsage field sums (not usage, which excludes subagents)', async () => {
    const raw = JSON.parse(await readFile(resolve(FIXTURES, 'claude-p-output-synthetic.json'), 'utf-8'));
    const mu = raw.modelUsage as Record<
      string,
      {
        inputTokens: number;
        outputTokens: number;
        cacheReadInputTokens: number;
        cacheCreationInputTokens: number;
        costUSD: number;
      }
    >;

    const expectedInput = Object.values(mu).reduce((s, e) => s + e.inputTokens, 0);
    const expectedOutput = Object.values(mu).reduce((s, e) => s + e.outputTokens, 0);
    const expectedCacheRead = Object.values(mu).reduce((s, e) => s + e.cacheReadInputTokens, 0);
    const expectedCacheWrite = Object.values(mu).reduce((s, e) => s + e.cacheCreationInputTokens, 0);
    const expectedCostFromModels = Object.values(mu).reduce((s, e) => s + e.costUSD, 0);

    const totals = modelUsageTotals(raw);
    expect(totals.input).toBe(expectedInput);
    expect(totals.output).toBe(expectedOutput);
    expect(totals.cacheRead).toBe(expectedCacheRead);
    expect(totals.cacheWrite).toBe(expectedCacheWrite);
    // Prefer top-level total_cost_usd when present
    expect(totals.costUsd).toBe(raw.total_cost_usd);
    expect(expectedCostFromModels).toBeCloseTo(0.0842, 5);

    // usage.input_tokens (main loop only) must NOT equal modelUsage sum
    expect(raw.usage.input_tokens).not.toBe(expectedInput);

    const collected = collectClaudeJson(raw, { runId: 'r-synth-1', taskId: 'T1' });
    const runEnd = collected.events.find((e) => e.event === 'run.end');
    expect(runEnd).toBeDefined();
    expect(runEnd!.usage!.input).toBe(expectedInput);
    expect(runEnd!.usage!.output).toBe(expectedOutput);
    expect(runEnd!.usage!.cacheRead).toBe(expectedCacheRead);
    expect(runEnd!.usage!.cacheWrite).toBe(expectedCacheWrite);
    expect(runEnd!.usage!.calls).toBeNull();
    expect(runEnd!.usage!.apiRetries).toBeNull();
    expect(runEnd!.usage!.reasoning).toBeNull();
    expect(runEnd!.cost!.usd).toBe(raw.total_cost_usd);
    expect(runEnd!.cost!.basis).toBe('host-estimate');
    expect(runEnd!.source!.usage).toBe('cc-json');
    expect(runEnd!.source!.reliability).toBe('high');

    const modelCalls = collected.events.filter((e) => e.event === 'model.call');
    expect(modelCalls.length).toBe(2);
  });

  test('missing fields are null, never 0', async () => {
    const raw = JSON.parse(
      await readFile(resolve(FIXTURES, 'claude-p-output-partial-synthetic.json'), 'utf-8'),
    );
    const collected = collectClaudeJson(raw, { runId: 'r-partial' });
    const call = collected.events.find((e) => e.event === 'model.call');
    expect(call).toBeDefined();
    expect(call!.usage!.input).toBe(2000);
    expect(call!.usage!.output).toBeNull();
    expect(call!.usage!.cacheRead).toBe(1000);
    expect(call!.usage!.cacheWrite).toBe(100);
    expect(call!.usage!.calls).toBeNull();
    expect(call!.cost!.usd).toBeNull();

    expect(collected.totals.output).toBeNull();
    // Must not coerce missing output to 0
    expect(collected.totals.output).not.toBe(0);
  });
});

describe('collectClaudeJson — real OpenRouter :free fixture', () => {
  test('replay modelUsage / usage / total_cost_usd; cost.basis is unknown', async () => {
    const raw = JSON.parse(
      await readFile(resolve(FIXTURES, 'claude-p-output-real-openrouter-free.json'), 'utf-8'),
    );
    expect(raw._fixture).toBe('real');

    const modelId = 'nvidia/nemotron-3-super-120b-a12b:free';
    const mu = raw.modelUsage[modelId];
    expect(mu).toBeDefined();

    const totals = modelUsageTotals(raw);
    expect(totals.input).toBe(mu.inputTokens);
    expect(totals.output).toBe(mu.outputTokens);
    expect(totals.cacheRead).toBe(mu.cacheReadInputTokens);
    expect(totals.cacheWrite).toBe(mu.cacheCreationInputTokens);
    expect(totals.costUsd).toBe(raw.total_cost_usd);
    // Top-level usage matches this single-model run (no subagents).
    expect(raw.usage.input_tokens).toBe(mu.inputTokens);
    expect(raw.usage.output_tokens).toBe(mu.outputTokens);

    const collected = collectClaudeJson(raw, {
      runId: 'r-real-or-free',
      hostVersion: '2.1.197',
    });
    expect(collected.missing).toEqual([]);

    const call = collected.events.find((e) => e.event === 'model.call');
    expect(call).toBeDefined();
    expect(call!.model!.id).toBe(modelId);
    expect(call!.model!.provider).toBe('openrouter');
    expect(call!.usage!.input).toBe(19670);
    expect(call!.usage!.output).toBe(72);
    expect(call!.usage!.cacheRead).toBe(0);
    expect(call!.usage!.cacheWrite).toBe(0);
    expect(call!.cost!.usd).toBe(raw.total_cost_usd);
    // Anthropic-table estimate on an OpenRouter :free model — not real spend.
    expect(call!.cost!.basis).toBe('unknown');
    expect(call!.cost!.basis).not.toBe('provider-billed');
    expect(call!.cost!.basis).not.toBe('host-estimate');
    expect(call!.cost!.isRealSpend).toBe(false);

    const runEnd = collected.events.find((e) => e.event === 'run.end');
    expect(runEnd).toBeDefined();
    expect(runEnd!.usage!.input).toBe(19670);
    expect(runEnd!.usage!.output).toBe(72);
    expect(runEnd!.cost!.usd).toBe(raw.total_cost_usd);
    expect(runEnd!.cost!.basis).toBe('unknown');
    expect(runEnd!.cost!.isRealSpend).toBe(false);
    expect(runEnd!.source!.usage).toBe('cc-json');
    expect(runEnd!.source!.reliability).toBe('high');
  });
});
