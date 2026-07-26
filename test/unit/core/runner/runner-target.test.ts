import { describe, expect, test } from 'bun:test';
import {
  INDIVIDUAL_TARGETS,
  RUNNER_TARGETS,
  getIndividualTargets,
  isRunnerTarget,
  parseRunnerTarget,
} from '../../../../src/core/runner/runner-target';

describe('core/runner/runner-target', () => {
  describe('isRunnerTarget', () => {
    test('happy path: accepts every known target', () => {
      for (const t of RUNNER_TARGETS) {
        expect(isRunnerTarget(t)).toBe(true);
      }
    });

    test('error case: rejects unknown strings', () => {
      expect(isRunnerTarget('vscode')).toBe(false);
      expect(isRunnerTarget('')).toBe(false);
    });
  });

  describe('parseRunnerTarget', () => {
    test('happy path: returns the target when valid', () => {
      expect(parseRunnerTarget('claude')).toBe('claude');
      expect(parseRunnerTarget('all')).toBe('all');
    });

    test('error case: throws with a descriptive message for invalid input', () => {
      expect(() => parseRunnerTarget('nope')).toThrow(/Invalid runner target: nope/);
      expect(() => parseRunnerTarget('nope')).toThrow(/Valid targets:/);
    });
  });

  describe('getIndividualTargets', () => {
    test("edge case: 'all' expands to every individual target", () => {
      expect(getIndividualTargets('all')).toEqual([...INDIVIDUAL_TARGETS]);
      expect(getIndividualTargets('all')).not.toContain('all');
    });

    test('happy path: a single target returns itself', () => {
      expect(getIndividualTargets('codex')).toEqual(['codex']);
    });

    test("edge case: returns a fresh array, not the INDIVIDUAL_TARGETS reference", () => {
      const result = getIndividualTargets('all');
      expect(result).not.toBe(INDIVIDUAL_TARGETS as unknown as string[]);
    });
  });
});
