import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import {
  buildTrackerReport,
  handleTrackerKey,
  initialTrackerUiState,
  renderTrackerScreen,
  watchTracker,
  type TrackerUiState,
} from '../src/core/goal/goal-tracker';
import { writeGoal } from '../src/core/goal/goal-state';
import type { GoalGraphInput } from '../src/validation/schemas';

function makeGraph(): GoalGraphInput {
  return {
    objective: 'track me',
    created_at: new Date().toISOString(),
    tasks: [
      { id: 't1', title: 'first', type: 'feature', risk: 'low', status: 'done', depends_on: [], acceptance_criteria: ['d'] },
      { id: 't2', title: 'second', type: 'fix', risk: 'low', status: 'blocked', depends_on: [], acceptance_criteria: ['d'], blocked_reason: 'waiting on api' },
      { id: 't3', title: 'third', type: 'test', risk: 'low', status: 'in-progress', depends_on: [], acceptance_criteria: ['d'] },
    ],
  };
}

describe('tracker TUI keys', () => {
  test('RED: arrows and jk move the selection with clamping', () => {
    let state: TrackerUiState = initialTrackerUiState();
    expect(state).toEqual({ selectedIndex: 0, showDetail: false });

    state = handleTrackerKey(state, '\x1b[B', 3).state;
    expect(state.selectedIndex).toBe(1);
    state = handleTrackerKey(state, 'j', 3).state;
    expect(state.selectedIndex).toBe(2);
    state = handleTrackerKey(state, 'j', 3).state;
    expect(state.selectedIndex).toBe(2);
    state = handleTrackerKey(state, '\x1b[A', 3).state;
    expect(state.selectedIndex).toBe(1);
    state = handleTrackerKey(state, 'k', 3).state;
    state = handleTrackerKey(state, 'k', 3).state;
    expect(state.selectedIndex).toBe(0);
  });

  test('enter toggles detail, q/Esc/Ctrl-C quit, unknown keys are ignored', () => {
    const state: TrackerUiState = initialTrackerUiState();
    expect(handleTrackerKey(state, '\r', 3).state.showDetail).toBe(true);
    expect(handleTrackerKey({ ...state, showDetail: true }, '\n', 3).state.showDetail).toBe(false);
    for (const key of ['q', 'Q', '\x03', '\x1b']) {
      expect(handleTrackerKey(state, key, 3).quit).toBe(true);
    }
    const ignored = handleTrackerKey(state, 'x', 3);
    expect(ignored.quit).toBe(false);
    expect(ignored.state).toEqual(state);
  });

  test('empty task list is safe', () => {
    const moved = handleTrackerKey(initialTrackerUiState(), 'j', 0);
    expect(moved.state.selectedIndex).toBe(0);
    expect(moved.quit).toBe(false);
  });
});

describe('tracker TUI render', () => {
  let dir: string;

  beforeEach(async () => {
    dir = resolve(tmpdir(), `cc-tracker-tui-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    await mkdir(dir, { recursive: true });
    expect((await writeGoal(dir, makeGraph())).success).toBe(true);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('selected row is marked and detail pane shows the blocked reason', async () => {
    const report = await buildTrackerReport(dir);
    expect(report.success).toBe(true);
    if (!report.success) return;
    const screen = renderTrackerScreen(report.data, 1, { selectedIndex: 1, showDetail: true });
    const rows = screen.split('\n').filter((l) => l.includes('t1') || l.includes('t2') || l.includes('t3'));
    expect(rows.filter((l) => l.startsWith('›'))).toHaveLength(1);
    expect(rows.find((l) => l.startsWith('›'))).toContain('t2');
    expect(screen).toContain('waiting on api');
  });

  test('out-of-range selection clamps to the last task', async () => {
    const report = await buildTrackerReport(dir);
    expect(report.success).toBe(true);
    if (!report.success) return;
    const screen = renderTrackerScreen(report.data, 1, { selectedIndex: 99, showDetail: false });
    expect(screen.split('\n').find((l) => l.startsWith('›'))).toContain('t3');
  });

  test('watch renders through the shared ui ref', async () => {
    const screens: string[] = [];
    const ui = { state: { selectedIndex: 2, showDetail: true }, taskCount: 0 };
    const result = await watchTracker(dir, { rounds: 1, write: (s) => screens.push(s), ui });
    expect(result.rounds).toBe(1);
    expect(screens).toHaveLength(1);
    expect(screens[0]).toContain('›');
    expect(ui.taskCount).toBe(3);
  });
});
