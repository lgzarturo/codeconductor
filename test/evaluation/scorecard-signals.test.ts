import { describe, expect, test } from 'bun:test';
import {
  collectScorecardSignals,
  criteriaFromSignals,
  parseScopeFiles,
} from '../../src/core/evaluation/scorecard-signals';

describe('collectScorecardSignals extra signals', () => {
  test('parses Markdown-formatted scope paths for diff matching', () => {
    expect(parseScopeFiles('`docs/odd-integration-plan.md`, `src/core/ccep/`, `test/example.test.ts`.')).toEqual([
      'docs/odd-integration-plan.md',
      'src/core/ccep/',
      'test/example.test.ts',
    ]);
  });

  test('extra scopeViolationCount sets minimal_diff to 0 and records finding', () => {
    const hints = collectScorecardSignals(process.cwd(), undefined, {
      scopeViolationCount: 3,
    });
    expect(hints.criteriaOverrides.minimal_diff?.score).toBe(0);
    expect(hints.criteriaOverrides.minimal_diff?.notes).toContain('3 scope violations');
    expect(hints.findings).toContain('Scope violation: 3 files outside scope.');
    expect(hints.scopeViolationCount).toBe(3);

    const criteria = criteriaFromSignals(hints);
    const minDiff = criteria.find((c) => c.id === 'minimal_diff');
    expect(minDiff?.score).toBe(0);
  });

  test('extra hashMismatch sets tests to 0 and records finding', () => {
    const hints = collectScorecardSignals(process.cwd(), undefined, {
      hashMismatch: true,
    });
    expect(hints.criteriaOverrides.tests?.score).toBe(0);
    expect(hints.criteriaOverrides.tests?.notes).toContain('Test tampering detected');
    expect(hints.findings).toContain('Test tampering detected via test-freeze hash mismatch.');
    expect(hints.hashMismatch).toBe(true);

    const criteria = criteriaFromSignals(hints);
    const testsCrit = criteria.find((c) => c.id === 'tests');
    expect(testsCrit?.score).toBe(0);
  });
});

describe('BC-028 real git measurement', () => {
  test('empty diff and unreadable git leave tests and cc_gain unmeasured', async () => {
    const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { execFileSync } = await import('node:child_process');
    const root = await mkdtemp(join(tmpdir(), 'cc-bc028-signals-'));
    try {
      const assertUnmeasured = (hints: ReturnType<typeof collectScorecardSignals>) => {
        for (const id of ['tests', 'cc_gain']) {
          const c = criteriaFromSignals(hints).find((c) => c.id === id)!;
          expect(c.score).toBeNull();
          expect(c.unmeasured).toBe(true);
          expect(c.notes).toContain('Unmeasured');
        }
      };
      assertUnmeasured(collectScorecardSignals(root));
      execFileSync('git', ['init', '-q', root]);
      await writeFile(join(root, 'file.ts'), 'export const value = 1;\n');
      execFileSync('git', ['add', '.'], { cwd: root });
      execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'base'], { cwd: root });
      assertUnmeasured(collectScorecardSignals(root));
      assertUnmeasured(collectScorecardSignals(root, undefined, { baseCommit: 'invalid-base' }));
      const tampered = criteriaFromSignals(collectScorecardSignals(root, undefined, { hashMismatch: true }));
      expect(tampered.find((c) => c.id === 'tests')?.score).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
