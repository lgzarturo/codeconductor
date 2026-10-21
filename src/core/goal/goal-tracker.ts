/**
 * Goal tracker — deterministic /cc-goal completion report.
 *
 * Joins goal-graph task state with PASS scorecard evidence. The goal is
 * complete only when every task is done AND holds a PASS scorecard, via a
 * review outcome or a saved scorecard record matched by task id.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { listOutcomes, listScorecards } from '../evaluation/outcome-store';
import { loadGoal } from './goal-state';
import { err, ok, type Result } from '../../utils/result';

const TRACKER_FILE = '.codeconductor/goal-tracker.md';

export interface TrackedTask {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly frozen: boolean;
  readonly failures: number;
  readonly scorecard: 'PASS' | 'none';
  readonly blockedReason?: string;
}

export interface GoalTrackerReport {
  readonly objective: string;
  readonly tasks: TrackedTask[];
  readonly totalCount: number;
  readonly doneCount: number;
  readonly passCount: number;
  readonly complete: boolean;
  readonly generatedAt: string;
}

async function passTaskIds(projectRoot: string): Promise<Set<string>> {
  const passed = new Set<string>();
  const outcomes = await listOutcomes(projectRoot);
  if (outcomes.success) {
    for (const outcome of outcomes.data) {
      if (outcome.verdict === 'PASS') passed.add(outcome.taskId);
    }
  }
  const scorecards = await listScorecards(projectRoot, { verdict: 'PASS' });
  if (scorecards.success) {
    for (const record of scorecards.data) {
      passed.add(record.taskId);
    }
  }
  return passed;
}

export async function buildTrackerReport(
  projectRoot: string,
): Promise<Result<GoalTrackerReport, Error>> {
  const goal = await loadGoal(projectRoot);
  if (!goal.success) return goal;

  const passed = await passTaskIds(projectRoot);
  const tasks: TrackedTask[] = goal.data.tasks.map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    frozen: task.frozen === true,
    failures: task.consecutive_failures ?? 0,
    scorecard: passed.has(task.id) ? 'PASS' : 'none',
    blockedReason: task.blocked_reason,
  }));

  const doneCount = tasks.filter((t) => t.status === 'done').length;
  const passCount = tasks.filter((t) => t.scorecard === 'PASS').length;
  const complete =
    tasks.length > 0 && tasks.every((t) => t.status === 'done' && t.scorecard === 'PASS');

  return ok({
    objective: goal.data.objective,
    tasks,
    totalCount: tasks.length,
    doneCount,
    passCount,
    complete,
    generatedAt: new Date().toISOString(),
  });
}

export function formatTrackerMarkdown(report: GoalTrackerReport): string {
  const lines = [
    '# Goal tracker',
    '',
    `Objective: ${report.objective}`,
    `Complete: ${report.complete ? 'yes' : 'no'} (${report.doneCount}/${report.totalCount} done, ${report.passCount}/${report.totalCount} PASS)`,
    `Generated: ${report.generatedAt}`,
    '',
    '| Task | Title | Status | Frozen | Failures | Scorecard |',
    '| --- | --- | --- | --- | ---: | --- |',
  ];
  for (const task of report.tasks) {
    lines.push(
      `| ${task.id} | ${task.title} | ${task.status} | ${task.frozen ? 'yes' : 'no'} | ${task.failures} | ${task.scorecard} |`,
    );
  }
  const blocked = report.tasks.filter((t) => t.blockedReason);
  if (blocked.length > 0) {
    lines.push('', '## Blocked reasons', '');
    for (const task of blocked) {
      lines.push(`- ${task.id}: ${task.blockedReason}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

export async function writeTrackerFile(
  projectRoot: string,
  report?: GoalTrackerReport,
): Promise<Result<{ path: string }, Error>> {
  try {
    let data = report;
    if (!data) {
      const built = await buildTrackerReport(projectRoot);
      if (!built.success) return built;
      data = built.data;
    }
    const dir = resolve(projectRoot, '.codeconductor');
    await mkdir(dir, { recursive: true });
    const path = resolve(projectRoot, TRACKER_FILE);
    await writeFile(path, formatTrackerMarkdown(data), 'utf-8');
    return ok({ path });
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}
