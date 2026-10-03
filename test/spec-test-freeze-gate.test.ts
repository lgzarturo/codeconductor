import { describe, expect, test } from 'bun:test';
import * as runner from '../src/core/verification/verification-runner';

// CA4: no specs/tests diffs except via the HANDS_OFF protocol (cc-spec-mutation
// Stage 3 hard rule + Stage 5 hands-off: only the mutation runner routing back
// to the craftsman may add the missing test). Contract for the implementer:
// verification-runner.ts gains `gateSpecTestDiffs({ changedFiles, handover })`
// mirroring the ScopeGuardResult shape (passed/violations). Result may be
// sync or async; `handover: true` marks the HANDS_OFF protocol as active.
interface GateOptions {
  readonly changedFiles: readonly string[];
  readonly handover?: boolean;
}

interface GateResult {
  readonly passed: boolean;
  readonly violations: readonly string[];
}

type GateSpecTestDiffs = (options: GateOptions) => GateResult | Promise<GateResult>;

function gate(): GateSpecTestDiffs {
  expect(typeof (runner as Record<string, unknown>).gateSpecTestDiffs).toBe('function');
  return (runner as unknown as { gateSpecTestDiffs: GateSpecTestDiffs }).gateSpecTestDiffs;
}

describe('CA4 — no specs/tests diffs except HANDS_OFF', () => {
  test('specs/tests diffs are violations', async () => {
    const result = await gate()({
      changedFiles: ['src/app.ts', 'specs/task.feature', 'tests/task.test.ts'],
    });
    expect(result.passed).toBe(false);
    expect([...result.violations]).toEqual(
      expect.arrayContaining(['specs/task.feature', 'tests/task.test.ts']),
    );
  });

  test('non-spec diffs pass', async () => {
    const result = await gate()({ changedFiles: ['src/app.ts'] });
    expect(result.passed).toBe(true);
    expect([...result.violations]).toHaveLength(0);
  });

  test('HANDS_OFF handover allows the missing-test write', async () => {
    const result = await gate()({
      changedFiles: ['tests/missing-branch.test.ts'],
      handover: true,
    });
    expect(result.passed).toBe(true);
  });
});
