/**
 * M2 — hooks session-end / subagent-stop / stop + loop retryReason + p95 budget.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { hookCommand } from '../../src/commands/hook.command';
import { evaluatePreTool } from '../../src/core/hooks/hook-runner';
import {
  emitAgentEndFromSubagentStop,
  emitLoopRetry,
  formatRetryReason,
  parseClaudeHookEnvelope,
} from '../../src/core/telemetry/hook-telemetry';
import { readTelemetryRun } from '../../src/core/telemetry/store';

const FIXTURES = resolve(import.meta.dir, '../fixtures/telemetry');

let ROOT: string;

beforeEach(async () => {
  ROOT = await mkdtemp(join(tmpdir(), 'cc-m2-hooks-'));
  await mkdir(join(ROOT, '.codeconductor'), { recursive: true });
});

afterEach(async () => {
  await rm(ROOT, { recursive: true, force: true });
});

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)]!;
}

describe('M2 hooks — simulated session with 2 subagents', () => {
  test('two SubagentStop fixtures → two agent.end with correct agent_type', async () => {
    const impl = await readFile(
      join(FIXTURES, 'hooks-subagent-stop-implementer-synthetic.json'),
      'utf-8',
    );
    const rev = await readFile(
      join(FIXTURES, 'hooks-subagent-stop-reviewer-synthetic.json'),
      'utf-8',
    );
    const sessionEnd = await readFile(join(FIXTURES, 'hooks-session-end-synthetic.json'), 'utf-8');

    const r1 = await hookCommand({
      event: 'subagent-stop',
      projectRoot: ROOT,
      output: 'json',
      stdinText: impl,
    });
    const r2 = await hookCommand({
      event: 'subagent-stop',
      projectRoot: ROOT,
      output: 'json',
      stdinText: rev,
    });
    expect(r1.code).toBe(0);
    expect(r2.code).toBe(0);
    expect((r1.data as { agentRole?: string }).agentRole).toBe('implementer');
    expect((r2.data as { agentRole?: string }).agentRole).toBe('reviewer');

    await hookCommand({
      event: 'session-end',
      projectRoot: ROOT,
      output: 'json',
      stdinText: sessionEnd,
    });
    await hookCommand({
      event: 'stop',
      projectRoot: ROOT,
      output: 'json',
      stdinText: sessionEnd,
    });

    const listed = await readTelemetryRun(ROOT, 'r-synth-session-m2-001');
    expect(listed.success).toBe(true);
    if (!listed.success) return;

    const agentEnds = listed.data.filter((e) => e.event === 'agent.end');
    expect(agentEnds.length).toBe(2);
    expect(agentEnds.map((e) => e.agent?.role).sort()).toEqual(['implementer', 'reviewer']);
    expect(agentEnds.every((e) => e.source?.reliability === 'high')).toBe(true);

    // Privacy: last_assistant_message must never appear in the jsonl
    const raw = await readFile(
      join(ROOT, '.codeconductor', 'telemetry', 'r-synth-session-m2-001.jsonl'),
      'utf-8',
    );
    expect(raw.includes('NEVER_STORE_THIS')).toBe(false);

    const runEnds = listed.data.filter((e) => e.event === 'run.end');
    expect(runEnds.length).toBe(1);
  });

  test('retryReason truncates to 120 chars; strict hashes', async () => {
    const long = 'x'.repeat(200);
    expect(formatRetryReason(long, 'standard').length).toBe(120);
    const hashed = formatRetryReason(long, 'strict');
    expect(hashed.startsWith('sha256:')).toBe(true);
    expect(hashed.includes('x')).toBe(false);

    await writeFile(
      join(ROOT, '.codeconductor', 'config.yml'),
      'version: "0.2.0"\nreport:\n  privacy: strict\n  history: true\n',
      'utf-8',
    );
    await emitLoopRetry(ROOT, {
      runId: 'r-retry-test',
      taskId: 'T1',
      iteration: 1,
      maxIterations: 3,
      feedback: 'compile failed in src/secret/path.ts with details',
    });
    const events = await readTelemetryRun(ROOT, 'r-retry-test');
    expect(events.success).toBe(true);
    if (!events.success) return;
    const retry = events.data.find((e) => e.event === 'retry');
    expect(retry?.loop?.retryReason?.startsWith('sha256:')).toBe(true);
  });

  test('presets/claude/settings.json registers async SessionEnd/SubagentStop/Stop', async () => {
    const settings = JSON.parse(
      await readFile(resolve(import.meta.dir, '../../presets/claude/settings.json'), 'utf-8'),
    ) as {
      hooks: Record<string, Array<{ hooks: Array<{ async?: boolean; command: string }> }>>;
    };
    for (const name of ['SessionEnd', 'SubagentStop', 'Stop'] as const) {
      const group = settings.hooks[name];
      expect(group).toBeDefined();
      const cmd = group![0]!.hooks[0]!;
      expect(cmd.async).toBe(true);
      expect(cmd.command).toContain(`invoke-hook.cjs ${name === 'SessionEnd' ? 'session-end' : name === 'SubagentStop' ? 'subagent-stop' : 'stop'}`);
    }
  });
});

describe('M2 p95 budget — hooks must not add >50ms to PreToolUse p95', () => {
  test('PreToolUse evaluatePreTool p95 stays under 50ms (no telemetry tax on the hot path)', () => {
    const samples: number[] = [];
    const N = 200;
    // warm-up
    for (let i = 0; i < 20; i++) evaluatePreTool({ command: 'git status', toolName: 'Bash' });
    for (let i = 0; i < N; i++) {
      const t0 = performance.now();
      evaluatePreTool({ command: 'git status', toolName: 'Bash' });
      samples.push(performance.now() - t0);
    }
    samples.sort((a, b) => a - b);
    const p95 = percentile(samples, 95);
    console.log(`M2 PreToolUse evaluatePreTool p95=${p95.toFixed(3)}ms (n=${N})`);
    expect(p95).toBeLessThanOrEqual(50);
  });

  test('subagent-stop emit path p95 ≤ 50ms (async hook budget)', async () => {
    const fixture = parseClaudeHookEnvelope(
      await readFile(join(FIXTURES, 'hooks-subagent-stop-implementer-synthetic.json'), 'utf-8'),
    );
    const samples: number[] = [];
    const N = 40;
    // warm-up
    for (let i = 0; i < 3; i++) {
      await emitAgentEndFromSubagentStop(ROOT, {
        ...fixture,
        session_id: `warm-${i}`,
        agent_id: `warm-${i}`,
      });
    }
    for (let i = 0; i < N; i++) {
      const t0 = performance.now();
      await emitAgentEndFromSubagentStop(ROOT, {
        ...fixture,
        session_id: `bench-${i}`,
        agent_id: `bench-agent-${i}`,
      });
      samples.push(performance.now() - t0);
    }
    samples.sort((a, b) => a - b);
    const p95 = percentile(samples, 95);
    console.log(`M2 subagent-stop emit p95=${p95.toFixed(2)}ms (n=${N})`);
    expect(p95).toBeLessThanOrEqual(50);
  });
});
