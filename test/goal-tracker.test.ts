import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs, routeCommand } from '../src/cli/router';
import {
  buildTrackerReport,
  renderTrackerScreen,
  watchTracker,
  writeTrackerFile,
} from '../src/core/goal/goal-tracker';
import { recordTaskStrike, writeGoal } from '../src/core/goal/goal-state';
import { appendOutcome, saveScorecard } from '../src/core/evaluation/outcome-store';
import {
  buildScorecardRecord,
  createDefaultCriteria,
} from '../src/core/evaluation/scorecard-calculator';
import type { GoalGraphInput } from '../src/validation/schemas';

function makeGraph(): GoalGraphInput {
  const task = (
    id: string,
    status: 'pending' | 'in-progress' | 'done' | 'blocked',
  ): GoalGraphInput['tasks'][number] => ({
    id,
    title: `task ${id}`,
    type: 'feature',
    risk: 'low',
    status,
    depends_on: [],
    acceptance_criteria: ['done'],
  });
  return {
    objective: 'track me',
    created_at: new Date().toISOString(),
    tasks: [task('t1', 'done'), task('t2', 'in-progress'), task('t3', 'in-progress')],
  };
}

async function passOutcome(dir: string, taskId: string): Promise<void> {
  const result = await appendOutcome(dir, {
    id: `out-${taskId}`,
    taskId,
    source: 'review',
    agent: 'reviewer',
    model: 'test-model',
    contractVersion: '0.0.0-test',
    timestamp: new Date().toISOString(),
    verdict: 'PASS',
  });
  expect(result.success).toBe(true);
}

async function passScorecard(dir: string, taskId: string): Promise<void> {
  const criteria = createDefaultCriteria().map((c) => ({ ...c, score: 3 }));
  const record = buildScorecardRecord({
    id: `sc-${taskId}`,
    taskId,
    agent: 'reviewer',
    contractVersion: '0.0.0-test',
    criteria,
  });
  expect(record.verdict).toBe('PASS');
  const saved = await saveScorecard(dir, record);
  expect(saved.success).toBe(true);
}

describe('goal tracker', () => {
  let dir: string;

  beforeEach(async () => {
    dir = resolve(tmpdir(), `cc-tracker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    await mkdir(dir, { recursive: true });
    expect((await writeGoal(dir, makeGraph())).success).toBe(true);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('report joins task status with PASS evidence; incomplete while work remains', async () => {
    await passOutcome(dir, 't1');
    const report = await buildTrackerReport(dir);
    expect(report.success).toBe(true);
    if (!report.success) return;
    expect(report.data.complete).toBe(false);
    expect(report.data.tasks.find((t) => t.id === 't1')).toMatchObject({
      status: 'done',
      scorecard: 'PASS',
    });
    expect(report.data.tasks.find((t) => t.id === 't2')).toMatchObject({
      status: 'in-progress',
      scorecard: 'none',
    });
  });

  test('done without PASS does not complete the goal', async () => {
    const graph = makeGraph();
    for (const task of graph.tasks) task.status = 'done';
    await writeGoal(dir, graph);
    const report = await buildTrackerReport(dir);
    expect(report.success && report.data.complete).toBe(false);
  });

  test('all done with PASS evidence completes, via outcomes and scorecards', async () => {
    const graph = makeGraph();
    for (const task of graph.tasks) task.status = 'done';
    await writeGoal(dir, graph);
    await passOutcome(dir, 't1');
    await passOutcome(dir, 't2');
    await passScorecard(dir, 't3');
    const report = await buildTrackerReport(dir);
    expect(report.success && report.data.complete).toBe(true);
    expect(report.success && report.data.passCount).toBe(3);
  });

  test('frozen tasks surface strikes and freeze state', async () => {
    await recordTaskStrike(dir, 't3', 'b1');
    await recordTaskStrike(dir, 't3', 'b2');
    await recordTaskStrike(dir, 't3', 'b3');
    const report = await buildTrackerReport(dir);
    const tracked = report.success && report.data.tasks.find((t) => t.id === 't3');
    expect(tracked).toMatchObject({ status: 'blocked', frozen: true, failures: 3 });
  });

  test('missing goal file errors', async () => {
    const empty = join(dir, 'empty');
    await mkdir(empty, { recursive: true });
    expect((await buildTrackerReport(empty)).success).toBe(false);
  });

  test('tracker file renders task rows and the completion line', async () => {
    await passOutcome(dir, 't1');
    const written = await writeTrackerFile(dir);
    expect(written.success).toBe(true);
    const content = await readFile(join(dir, '.codeconductor', 'goal-tracker.md'), 'utf-8');
    expect(content).toContain('t1');
    expect(content).toContain('PASS');
    expect(content).toContain('Complete: no');
  });

  test('goal --tracker serves the report as JSON and markdown', async () => {
    await passOutcome(dir, 't1');
    const json = await routeCommand(parseArgs(['goal', '--tracker', '--output=json']), dir);
    expect(json.code).toBe(0);
    expect(json.data).toMatchObject({ command: 'goal tracker', report: { complete: false } });
    const human = await routeCommand(parseArgs(['goal', '--tracker']), dir);
    expect(human.code).toBe(0);
    expect((human.data as { output: string }).output).toContain('# Goal tracker');
  });
});

describe('goal tracker watch', () => {
  let dir: string;

  beforeEach(async () => {
    dir = resolve(tmpdir(), `cc-watch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    await mkdir(dir, { recursive: true });
    expect((await writeGoal(dir, makeGraph())).success).toBe(true);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('screen renders objective, task glyphs and round', async () => {
    await passOutcome(dir, 't1');
    const report = await buildTrackerReport(dir);
    if (!report.success) return;
    const screen = renderTrackerScreen(report.data, 3);
    expect(screen).toContain('track me');
    expect(screen).toContain('t1');
    expect(screen).toContain('PASS');
    expect(screen).toContain('round 3');
    expect(screen).toContain('q to quit');
  });

  test('watch re-renders on state changes until rounds run out', async () => {
    const screens: string[] = [];
    let strikes = 0;
    const result = await watchTracker(dir, {
      rounds: 2,
      write: (s) => screens.push(s),
      sleep: async () => {
        if (strikes === 0) {
          strikes++;
          await recordTaskStrike(dir, 't2', 'boom');
        }
      },
    });
    expect(result.rounds).toBe(2);
    expect(screens).toHaveLength(2);
    expect(screens[0]).not.toContain('failures: 1');
    expect(screens[1]).toContain('failures: 1');
  });

  test('watch stops when cancelled', async () => {
    let calls = 0;
    const result = await watchTracker(dir, {
      write: () => {
        calls++;
      },
      sleep: async () => {},
      isCancelled: () => calls >= 1,
    });
    expect(result.rounds).toBe(1);
  });

  test('watch surfaces build errors instead of looping', async () => {
    const empty = join(dir, 'empty');
    await mkdir(empty, { recursive: true });
    const screens: string[] = [];
    const result = await watchTracker(empty, {
      rounds: 5,
      write: (s) => screens.push(s),
      sleep: async () => {},
    });
    expect(result.rounds).toBe(0);
    expect(screens).toHaveLength(1);
    expect(screens[0]).toMatch(/tracker error/i);
  });

  test('goal --tracker --watch runs bounded rounds off-TTY', async () => {
    const json = await routeCommand(
      parseArgs(['goal', '--tracker', '--watch', '--rounds', '2', '--interval-ms', '20', '--output=json']),
      dir,
    );
    expect(json.code).toBe(0);
    expect(json.data).toMatchObject({ command: 'goal tracker', rounds: 2 });
  });

  test('goal --tracker --watch needs rounds without a TTY', async () => {
    const result = await routeCommand(parseArgs(['goal', '--tracker', '--watch']), dir);
    expect(result.code).toBe(1);
  });
});
