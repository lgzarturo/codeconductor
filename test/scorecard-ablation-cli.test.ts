import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { scorecardCommand } from '../src/commands/scorecard.command';

const SUITE_PATH = resolve(import.meta.dir, '../eval/suites/harness-v1/suite.yml');

let TEST_DIR: string;

describe('scorecard ablation CLI', () => {
  beforeEach(async () => {
    TEST_DIR = await mkdtemp(join(tmpdir(), 'cc-scorecard-ablation-'));
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  test('catalog lists v1 components', async () => {
    const result = await scorecardCommand({
      subcommand: 'catalog',
      projectRoot: TEST_DIR,
      output: 'json',
    });
    expect(result.code).toBe(0);
    const catalog = (result.data as { catalog: { components: Array<{ id: string }> } }).catalog;
    expect(catalog.components.map((c) => c.id)).toContain('review');
    expect(catalog.components.map((c) => c.id)).toContain('product_graph');
  });

  test('record tags experiment fields and ablation reports a pair', async () => {
    await scorecardCommand({
      subcommand: 'record',
      projectRoot: TEST_DIR,
      output: 'json',
      taskId: 'fix-add-off-by-one',
      verdict: 'PASS',
      weightedScore: 2.5,
      experimentId: 'abl-cli',
      variantId: 'baseline',
      suiteTaskId: 'fix-add-off-by-one',
    });
    await scorecardCommand({
      subcommand: 'record',
      projectRoot: TEST_DIR,
      output: 'json',
      taskId: 'fix-add-off-by-one',
      verdict: 'REVISE',
      weightedScore: 2.1,
      experimentId: 'abl-cli',
      variantId: 'minus:review',
      suiteTaskId: 'fix-add-off-by-one',
    });
    const ablation = await scorecardCommand({
      subcommand: 'ablation',
      projectRoot: TEST_DIR,
      output: 'json',
      experimentId: 'abl-cli',
    });
    expect(ablation.code).toBe(0);
    const report = (ablation.data as { report: { rows: Array<{ component: string; verdict: string }> } }).report;
    expect(report.rows.some((r) => r.component === 'review' && r.verdict === 'degrades')).toBe(true);
  });

  test('experiment start uses the golden suite', async () => {
    const started = await scorecardCommand({
      subcommand: 'experiment',
      projectRoot: TEST_DIR,
      output: 'json',
      experimentAction: 'start',
      suiteId: 'harness-v1',
      suitePath: SUITE_PATH,
      components: 'docs',
      experimentId: 'abl-cli-start',
    });
    expect(started.code).toBe(0);
    const experiment = (started.data as { experiment: { variants: string[] } }).experiment;
    expect(experiment.variants).toEqual(['baseline', 'minus:docs']);
  });
});
