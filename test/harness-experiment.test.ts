import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';
import {
  applyExperimentVariant,
  startHarnessExperiment,
} from '../src/core/evaluation/harness-experiment';
import { readActiveOverlay } from '../src/core/evaluation/harness-catalog';

const REPO_ROOT = resolve(import.meta.dir, '..');
const SUITE_PATH = join(REPO_ROOT, 'eval/suites/harness-v1/suite.yml');

let TEST_DIR: string;

describe('harness-experiment', () => {
  beforeEach(async () => {
    TEST_DIR = await mkdtemp(join(tmpdir(), 'cc-harness-exp-'));
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  test('start materializes baseline and minus runs with Task Cards', async () => {
    const started = await startHarnessExperiment(TEST_DIR, {
      suiteId: 'harness-v1',
      suitePath: SUITE_PATH,
      components: ['review'],
      contractVersion: '1.0.0',
      experimentId: 'abl-fixture-review',
    });
    expect(started.success).toBe(true);
    if (!started.success) return;
    expect(started.data.variants).toEqual(['baseline', 'minus:review']);
    expect(started.data.suiteTaskIds).toContain('fix-add-off-by-one');

    const baseline = join(
      TEST_DIR,
      '.codeconductor/evaluation/experiments/abl-fixture-review/runs/fix-add-off-by-one/baseline'
    );
    const minus = join(
      TEST_DIR,
      '.codeconductor/evaluation/experiments/abl-fixture-review/runs/fix-add-off-by-one/minus-review'
    );
    expect(existsSync(join(baseline, 'TASK.md'))).toBe(true);
    expect(existsSync(join(minus, 'TASK.md'))).toBe(true);
    expect(existsSync(join(minus, 'src/math.ts'))).toBe(true);

    const minusFeature = parse(
      await readFile(join(minus, '.codeconductor/workflows/feature.yml'), 'utf-8')
    ) as { routing: { default: string[] } };
    expect(minusFeature.routing.default).not.toContain('review');

    const baselineFeature = parse(
      await readFile(join(baseline, '.codeconductor/workflows/feature.yml'), 'utf-8')
    ) as { routing: { default: string[] } };
    expect(baselineFeature.routing.default).toContain('review');
  });

  test('apply writes overlay on the current project and backups originals', async () => {
    const started = await startHarnessExperiment(TEST_DIR, {
      suiteId: 'harness-v1',
      suitePath: SUITE_PATH,
      components: ['wayfinding'],
      contractVersion: '1.0.0',
      experimentId: 'abl-apply',
    });
    expect(started.success).toBe(true);

    const applied = await applyExperimentVariant(TEST_DIR, 'abl-apply', 'minus:wayfinding', '1.0.0');
    expect(applied.success).toBe(true);
    const overlay = await readActiveOverlay(TEST_DIR);
    expect(overlay?.variantId).toBe('minus:wayfinding');
    expect(overlay?.disabledComponents).toEqual(['wayfinding']);
    expect(existsSync(join(TEST_DIR, '.codeconductor/evaluation/overlay-backup'))).toBe(true);
  });
});
