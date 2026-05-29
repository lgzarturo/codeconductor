/**
 * Tests for Runner Target validation and parsing.
 * Ensures 6 AI tool targets (including new agy) are properly supported.
 */
import { describe, expect, test } from 'bun:test';
import {
  getIndividualTargets,
  isRunnerTarget,
  parseRunnerTarget,
  RUNNER_TARGETS,
  INDIVIDUAL_TARGETS,
} from '../src/core/runner/runner-target';

describe('RunnerTarget', () => {
  describe('RUNNER_TARGETS constant', () => {
    test('contains all 7 targets including all', () => {
      expect(RUNNER_TARGETS).toContain('opencode');
      expect(RUNNER_TARGETS).toContain('claude');
      expect(RUNNER_TARGETS).toContain('codex');
      expect(RUNNER_TARGETS).toContain('gemini');
      expect(RUNNER_TARGETS).toContain('cursor');
      expect(RUNNER_TARGETS).toContain('agy');
      expect(RUNNER_TARGETS).toContain('all');
      expect(RUNNER_TARGETS).toHaveLength(7);
    });
  });

  describe('INDIVIDUAL_TARGETS constant', () => {
    test('contains all 6 individual targets', () => {
      expect(INDIVIDUAL_TARGETS).toContain('opencode');
      expect(INDIVIDUAL_TARGETS).toContain('claude');
      expect(INDIVIDUAL_TARGETS).toContain('codex');
      expect(INDIVIDUAL_TARGETS).toContain('gemini');
      expect(INDIVIDUAL_TARGETS).toContain('cursor');
      expect(INDIVIDUAL_TARGETS).toContain('agy');
      expect(INDIVIDUAL_TARGETS).toHaveLength(6);
    });

    test('does not contain all', () => {
      expect(INDIVIDUAL_TARGETS).not.toContain('all');
    });
  });

  describe('isRunnerTarget', () => {
    test('returns true for valid targets', () => {
      expect(isRunnerTarget('opencode')).toBe(true);
      expect(isRunnerTarget('claude')).toBe(true);
      expect(isRunnerTarget('codex')).toBe(true);
      expect(isRunnerTarget('gemini')).toBe(true);
      expect(isRunnerTarget('cursor')).toBe(true);
      expect(isRunnerTarget('agy')).toBe(true);
      expect(isRunnerTarget('all')).toBe(true);
    });

    test('returns false for invalid targets', () => {
      expect(isRunnerTarget('unknown')).toBe(false);
      expect(isRunnerTarget('invalid')).toBe(false);
      expect(isRunnerTarget('')).toBe(false);
      expect(isRunnerTarget('ALL')).toBe(false); // case sensitive
    });
  });

  describe('parseRunnerTarget', () => {
    test('parses valid targets successfully', () => {
      expect(parseRunnerTarget('opencode')).toBe('opencode');
      expect(parseRunnerTarget('claude')).toBe('claude');
      expect(parseRunnerTarget('codex')).toBe('codex');
      expect(parseRunnerTarget('gemini')).toBe('gemini');
      expect(parseRunnerTarget('cursor')).toBe('cursor');
      expect(parseRunnerTarget('agy')).toBe('agy');
      expect(parseRunnerTarget('all')).toBe('all');
    });

    test('throws error for invalid target', () => {
      expect(() => parseRunnerTarget('unknown')).toThrow();
      expect(() => parseRunnerTarget('unknown')).toThrow('Invalid runner target');
    });
  });

  describe('getIndividualTargets', () => {
    test('returns array with single target for individual targets', () => {
      expect(getIndividualTargets('opencode')).toEqual(['opencode']);
      expect(getIndividualTargets('claude')).toEqual(['claude']);
      expect(getIndividualTargets('codex')).toEqual(['codex']);
      expect(getIndividualTargets('gemini')).toEqual(['gemini']);
      expect(getIndividualTargets('cursor')).toEqual(['cursor']);
      expect(getIndividualTargets('agy')).toEqual(['agy']);
    });

    test('returns all individual targets for all', () => {
      const targets = getIndividualTargets('all');
      expect(targets).toHaveLength(6);
      expect(targets).toContain('opencode');
      expect(targets).toContain('claude');
      expect(targets).toContain('codex');
      expect(targets).toContain('gemini');
      expect(targets).toContain('cursor');
      expect(targets).toContain('agy');
    });
  });
});

// New targets acceptance criteria
describe('New AI Tool Targets', () => {
  test('gemini is a valid runner target', () => {
    expect(isRunnerTarget('gemini')).toBe(true);
    expect(parseRunnerTarget('gemini')).toBe('gemini');
  });

  test('cursor is a valid runner target', () => {
    expect(isRunnerTarget('cursor')).toBe(true);
    expect(parseRunnerTarget('cursor')).toBe('cursor');
  });

  test('agy is a valid runner target', () => {
    expect(isRunnerTarget('agy')).toBe(true);
    expect(parseRunnerTarget('agy')).toBe('agy');
  });
});
