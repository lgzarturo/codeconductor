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

const STATUS_GLYPH: Record<string, string> = {
  done: '✓',
  'in-progress': '…',
  pending: '○',
  blocked: '✗',
};

export interface TrackerUiState {
  readonly selectedIndex: number;
  readonly showDetail: boolean;
}

export function initialTrackerUiState(): TrackerUiState {
  return { selectedIndex: 0, showDetail: false };
}

function clampSelection(index: number, taskCount: number): number {
  if (taskCount <= 0) return 0;
  return Math.min(Math.max(index, 0), taskCount - 1);
}

/**
 * Pure key reducer for the interactive watch screen. Arrow escape sequences
 * arrive whole in raw mode; a lone ESC still quits.
 */
export function handleTrackerKey(
  state: TrackerUiState,
  key: string,
  taskCount: number,
): { state: TrackerUiState; quit: boolean } {
  if (key === 'q' || key === 'Q' || key === '\x03' || key === '\x1b') {
    return { state, quit: true };
  }
  if (key === '\x1b[A' || key === '\x1bOA' || key === 'k') {
    return { state: { ...state, selectedIndex: clampSelection(state.selectedIndex - 1, taskCount) }, quit: false };
  }
  if (key === '\x1b[B' || key === '\x1bOB' || key === 'j') {
    return { state: { ...state, selectedIndex: clampSelection(state.selectedIndex + 1, taskCount) }, quit: false };
  }
  if (key === '\r' || key === '\n') {
    return { state: { ...state, showDetail: !state.showDetail }, quit: false };
  }
  return { state, quit: false };
}

export function renderTrackerScreen(
  report: GoalTrackerReport,
  round: number,
  ui?: TrackerUiState,
): string {
  const selected = ui ? clampSelection(ui.selectedIndex, report.tasks.length) : -1;
  const lines = [
    `Goal: ${report.objective} — ${report.complete ? 'COMPLETE ✓' : 'in progress'} (round ${round})`,
    `Done ${report.doneCount}/${report.totalCount} · PASS ${report.passCount}/${report.totalCount}`,
    '',
    ...report.tasks.map((task, index) => {
      const glyph = STATUS_GLYPH[task.status] ?? '?';
      const frozen = task.frozen ? ' FROZEN' : '';
      const marker = ui ? (index === selected ? '›' : ' ') : '';
      const prefix = ui ? `${marker} ` : '';
      return `${prefix}${glyph} ${task.id} [${task.status}]${frozen} failures: ${task.failures} · ${task.scorecard} — ${task.title}`;
    }),
  ];
  if (ui?.showDetail && report.tasks.length > 0) {
    const task = report.tasks[selected]!;
    lines.push(
      '',
      `— ${task.id}: ${task.title}`,
      `  status ${task.status} · frozen ${task.frozen ? 'yes' : 'no'} · failures ${task.failures} · scorecard ${task.scorecard}`,
    );
    if (task.blockedReason) lines.push(`  blocked: ${task.blockedReason}`);
  }
  lines.push('', `updated ${report.generatedAt} · ↑↓/jk select · enter detail · q to quit`);
  return `${lines.join('\n')}\n`;
}

export interface TrackerUiRef {
  state: TrackerUiState;
  taskCount: number;
}

export interface WatchTrackerOptions {
  readonly intervalMs?: number;
  readonly rounds?: number;
  readonly clear?: boolean;
  readonly write?: (screen: string) => void;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly isCancelled?: () => boolean;
  /** Shared with the key handler: watch updates taskCount, keys update state. */
  readonly ui?: TrackerUiRef;
}

export async function watchTracker(
  projectRoot: string,
  options: WatchTrackerOptions = {},
): Promise<{ rounds: number }> {
  const intervalMs = options.intervalMs ?? 2000;
  const maxRounds = options.rounds;
  const write = options.write ?? ((screen: string) => process.stdout.write(screen));
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const isCancelled = options.isCancelled ?? (() => false);
  let rounds = 0;
  for (;;) {
    if (isCancelled()) break;
    if (maxRounds !== undefined && rounds >= maxRounds) break;
    const report = await buildTrackerReport(projectRoot);
    if (!report.success) {
      write(`tracker error: ${report.error.message}\n`);
      break;
    }
    rounds += 1;
    if (options.ui) options.ui.taskCount = report.data.tasks.length;
    const prefix = options.clear === true ? '\x1b[2J\x1b[H' : '';
    write(`${prefix}${renderTrackerScreen(report.data, rounds, options.ui?.state)}`);
    if (maxRounds !== undefined && rounds >= maxRounds) break;
    if (isCancelled()) break;
    await sleep(intervalMs);
  }
  return { rounds };
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
