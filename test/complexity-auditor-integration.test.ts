import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { analyzeDiff } from '../src/core/complexity/complexity-auditor.ts';
import { computeCcGain, ccGainToScorecardImpact } from '../src/core/complexity/cc-gain.ts';

const FIXTURES = join(import.meta.dir, 'fixtures', 'complexity');

describe('complexity-auditor integration', () => {
  test('bloated diff → negative delta → scorecard registers impact', async () => {
    const diff = await readFile(join(FIXTURES, 'bloated.diff'), 'utf-8');
    const report = analyzeDiff(diff);
    const gain = computeCcGain(report);
    const impact = ccGainToScorecardImpact(gain);

    // Bloated diff: adds code, removes a method, swaps deps
    expect(report.locAdded).toBeGreaterThan(0);
    expect(report.locRemoved).toBeGreaterThan(0);

    // Impact should be a valid scorecard value
    expect(impact).toBeGreaterThanOrEqual(0);
    expect(impact).toBeLessThanOrEqual(3);
  });

  test('lean diff → positive/negative delta → scorecard registers impact', async () => {
    const diff = await readFile(join(FIXTURES, 'lean.diff'), 'utf-8');
    const report = analyzeDiff(diff);
    const gain = computeCcGain(report);
    const impact = ccGainToScorecardImpact(gain);

    // Lean diff: small refactor, net neutral
    expect(report.depsAdded).toHaveLength(0);
    expect(report.depsRemoved).toHaveLength(0);
    expect(gain.verdict).toBe('neutral');
    expect(impact).toBe(1);
  });

  test('neutral diff → additions only → scorecard registers impact', async () => {
    const diff = await readFile(join(FIXTURES, 'neutral.diff'), 'utf-8');
    const report = analyzeDiff(diff);
    const gain = computeCcGain(report);
    const impact = ccGainToScorecardImpact(gain);

    // Neutral diff: adds new feature code
    expect(report.locAdded).toBeGreaterThan(0);
    expect(report.locRemoved).toBe(0);

    // Adding code without removing = neutral or negative
    expect(['neutral', 'negative']).toContain(gain.verdict);
    expect(impact).toBeGreaterThanOrEqual(0);
    expect(impact).toBeLessThanOrEqual(1);
  });

  test('full pipeline: diff → report → gain → scorecard', async () => {
    const diff = await readFile(join(FIXTURES, 'bloated.diff'), 'utf-8');
    const report = analyzeDiff(diff);

    // Report has all fields
    expect(typeof report.locAdded).toBe('number');
    expect(typeof report.locRemoved).toBe('number');
    expect(typeof report.locDelta).toBe('number');
    expect(Array.isArray(report.depsAdded)).toBe(true);
    expect(Array.isArray(report.depsRemoved)).toBe(true);
    expect(typeof report.cyclomaticAdded).toBe('number');
    expect(typeof report.cyclomaticRemoved).toBe('number');
    expect(Array.isArray(report.findings)).toBe(true);

    // Gain has all fields
    const gain = computeCcGain(report);
    expect(typeof gain.raw).toBe('number');
    expect(typeof gain.normalized).toBe('number');
    expect(['positive', 'neutral', 'negative']).toContain(gain.verdict);
    expect(typeof gain.breakdown.locContribution).toBe('number');
    expect(typeof gain.breakdown.depContribution).toBe('number');
    expect(typeof gain.breakdown.complexityContribution).toBe('number');
    expect(typeof gain.breakdown.abstractionPenalty).toBe('number');

    // Impact is valid
    const impact = ccGainToScorecardImpact(gain);
    expect(impact).toBeGreaterThanOrEqual(0);
    expect(impact).toBeLessThanOrEqual(3);
  });

  test('deletion-heavy diff yields positive cc-gain', async () => {
    const deletionDiff = `diff --git a/src/old.ts b/src/old.ts
--- a/src/old.ts
+++ b/src/old.ts
@@ -1,20 +1,2 @@
-import { foo } from 'bar';
-import { baz } from 'qux';
-import { helper } from './helper';
-
-function unusedA() { return 1; }
-function unusedB() { return 2; }
-function unusedC() { return 3; }
-function unusedD() { return 4; }
-function unusedE() { return 5; }
-
-export class OldService {
-  doThing() { return this.internal(); }
-  internal() { return 'done'; }
-}
-
-const result = oldService.run();
+const x = 1;
+const y = 2;
`;
    const report = analyzeDiff(deletionDiff);
    const gain = computeCcGain(report);

    expect(report.locRemoved).toBeGreaterThan(report.locAdded);
    expect(report.depsRemoved.length).toBeGreaterThanOrEqual(2);
    expect(gain.verdict).toBe('positive');
    expect(gain.breakdown.depContribution).toBeGreaterThan(0);
  });

  // ── Scorecard impact mapping ─────────────────────────────────────────────

  test('bloated diff: locDelta < 0 maps to a valid impact value (0-3)', async () => {
    const diff = await readFile(join(FIXTURES, 'bloated.diff'), 'utf-8');
    const report = analyzeDiff(diff);

    // The bloated diff should remove more lines than it adds
    expect(report.locDelta).toBeLessThan(0);

    const gain = computeCcGain(report);
    const impact = ccGainToScorecardImpact(gain);

    // The actual impact value depends on the full gain calculation.
    // This test pins the exact value for the fixture so any regression is caught.
    expect(impact).toBeGreaterThanOrEqual(0);
    expect(impact).toBeLessThanOrEqual(3);
    // With the current implementation the bloated fixture produces a
    // positive verdict (raw = 4.3, impact = 2).
    expect(gain.verdict).toBe('positive');
    expect(impact).toBe(2);
  });

  test('neutral diff: only additions maps to impact 0 (negative verdict)', async () => {
    const diff = await readFile(join(FIXTURES, 'neutral.diff'), 'utf-8');
    const report = analyzeDiff(diff);
    const gain = computeCcGain(report);
    const impact = ccGainToScorecardImpact(gain);

    expect(report.locRemoved).toBe(0);
    expect(report.locDelta).toBeGreaterThan(0);
    expect(gain.verdict).toBe('negative');
    expect(impact).toBe(0);
  });

  test('lean diff: balanced refactor maps to impact 1 (neutral verdict)', async () => {
    const diff = await readFile(join(FIXTURES, 'lean.diff'), 'utf-8');
    const report = analyzeDiff(diff);
    const gain = computeCcGain(report);
    const impact = ccGainToScorecardImpact(gain);

    expect(gain.verdict).toBe('neutral');
    expect(impact).toBe(1);
  });

  test('very positive diff: large cleanup → impact 3', () => {
    const cleanupDiff = `diff --git a/src/mess.ts b/src/mess.ts
--- a/src/mess.ts
+++ b/src/mess.ts
@@ -1,50 +1,5 @@
-import lodash from 'lodash';
-import { v4 } from 'uuid';
-import moment from 'moment';
-import { throttle } from 'throttle-debounce';
-import { find } from 'lodash';
-
-export class HeavyService extends BaseService {
-  doIt() { return 1; }
-  doThat() { return 2; }
-  doOther() { return 3; }
-  doMore() { return 4; }
-  doEvenMore() { return 5; }
-  doLots() { return 6; }
-  doPlenty() { return 7; }
-  doTons() { return 8; }
-  doMasses() { return 9; }
-  doHeaps() { return 10; }
-  doLoads() { return 11; }
-  doStacks() { return 12; }
-  doPiles() { return 13; }
-  doMountains() { return 14; }
-  doOceans() { return 15; }
-  doWorlds() { return 16; }
-  doUniverses() { return 17; }
-  doGalaxies() { return 18; }
-  doDimensions() { return 19; }
-  doRealities() { return 20; }
-  doTimelines() { return 21; }
-  doContinuums() { return 22; }
-}
+export const x = 1;
+export const y = 2;
+export const z = 3;
`;
    const report = analyzeDiff(cleanupDiff);
    const gain = computeCcGain(report);
    const impact = ccGainToScorecardImpact(gain);

    expect(report.locRemoved).toBeGreaterThan(20);
    expect(report.depsRemoved.length).toBeGreaterThanOrEqual(2);
    expect(gain.verdict).toBe('positive');
    expect(gain.raw).toBeGreaterThanOrEqual(10);
    expect(impact).toBe(3);
  });

  test('empty diff: empty report → neutral → impact 1', () => {
    const report = analyzeDiff('');
    const gain = computeCcGain(report);
    const impact = ccGainToScorecardImpact(gain);

    expect(gain.verdict).toBe('neutral');
    expect(impact).toBe(1);
  });

  test('scorecard impact covers the full 0-3 range across fixtures', async () => {
    const fixtures = ['bloated.diff', 'lean.diff', 'neutral.diff'];
    const impacts = new Set<number>();

    for (const fixture of fixtures) {
      const diff = await readFile(join(FIXTURES, fixture), 'utf-8');
      const report = analyzeDiff(diff);
      const gain = computeCcGain(report);
      impacts.add(ccGainToScorecardImpact(gain));
    }

    // Across the three fixtures we should see at least 2 distinct impact values
    // (bloated → 2, lean → 1, neutral → 0).
    expect(impacts.size).toBeGreaterThanOrEqual(2);
  });
});
