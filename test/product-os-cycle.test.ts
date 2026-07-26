import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runIngest } from '../src/core/knowledge/ingest-pipeline';
import { planGoal } from '../src/core/goal/goal-planner';
import { writeGoal, loadGoal } from '../src/core/goal/goal-state';
import { getNextTask, completeTask } from '../src/core/orchestrator/runtime-orchestrator';
import { runVerification } from '../src/core/verification/verification-runner';
import { runFeedbackLoop } from '../src/core/feedback/feedback-ingestor';
import { listEvents } from '../src/core/memory/episodic-store';

describe('Product OS cycle', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'cc-cycle-'));
    await mkdir(join(projectRoot, 'docs', 'adr'), { recursive: true });
    await writeFile(join(projectRoot, 'README.md'), '# Cycle Test\n\nE2E product OS.\n', 'utf-8');
    await writeFile(
      join(projectRoot, 'docs', 'adr', 'adr-001.md'),
      '# ADR-001: Test\n\n**Status:** accepted\n\n## Context\nC\n\n## Decision\nD\n\n## Consequences\n- E\n',
      'utf-8',
    );
    await mkdir(join(projectRoot, '.codeconductor'), { recursive: true });
    await writeFile(
      join(projectRoot, '.codeconductor', 'config.yml'),
      `version: "0.5.0"
project:
  name: cycle-test
defaults:
  target: cursor
  overwrite: false
presets:
  council:
    enabled: true
    version: "0.5.0"
safety:
  destructiveCommands: []
  secretPatterns: []
`,
      'utf-8',
    );
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  test('ingest → goal → orchestrate next → verify → complete → feedback', async () => {
    const ingest = await runIngest(projectRoot, 'cycle-test');
    expect(ingest.nodes).toBeGreaterThan(0);

    const graph = planGoal('Add logging');
    await writeGoal(projectRoot, graph);

    const next = await getNextTask(projectRoot, 'cycle-test');
    expect(next.success).toBe(true);
    if (!next.success) return;

    const verify = await runVerification(projectRoot, next.data.task.id);
    expect(verify.success).toBe(true);

    const complete = await completeTask(projectRoot, next.data.task.id);
    expect(complete.success).toBe(true);

    const goal = await loadGoal(projectRoot);
    expect(goal.success).toBe(true);
    if (goal.success) {
      const task = goal.data.tasks.find((t) => t.id === next.data.task.id);
      expect(task?.status).toBe('done');
    }

    const insights = await runFeedbackLoop(projectRoot);
    expect(insights.length).toBeGreaterThan(0);

    const events = await listEvents(projectRoot);
    expect(events.success).toBe(true);
    if (events.success) {
      expect(events.data.some((e) => e.type === 'ingest.completed')).toBe(true);
      expect(events.data.some((e) => e.type === 'task.completed')).toBe(true);
    }
  });
});
