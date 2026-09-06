import { expect, test, describe } from 'bun:test';
import { evaluateGate } from '../src/core/evaluation/scorecard-gatekeeper';

describe('scorecard-gatekeeper', () => {
  test('All metrics pass -> PASS', () => {
    const result = evaluateGate({
      testsPassed: true,
      mutationScore: 90,
      scopeViolations: 0,
      hashValid: true
    });
    expect(result.verdict).toBe('PASS');
    expect(result.reasons).toHaveLength(0);
  });

  test('Tests failed -> REJECT with reason', () => {
    const result = evaluateGate({
      testsPassed: false,
      mutationScore: 90,
      scopeViolations: 0,
      hashValid: true
    });
    expect(result.verdict).toBe('REJECT');
    expect(result.reasons).toContain('Tests did not pass');
  });

  test('Mutation score below 85 -> REJECT with reason', () => {
    const result = evaluateGate({
      testsPassed: true,
      mutationScore: 80,
      scopeViolations: 0,
      hashValid: true
    });
    expect(result.verdict).toBe('REJECT');
    expect(result.reasons.some(r => r.includes('below the 85% threshold'))).toBe(true);
  });

  test('Scope violations > 0 -> REJECT with reason', () => {
    const result = evaluateGate({
      testsPassed: true,
      mutationScore: 90,
      scopeViolations: 1,
      hashValid: true
    });
    expect(result.verdict).toBe('REJECT');
    expect(result.reasons.some(r => r.includes('1 scope violation'))).toBe(true);
  });

  test('Hash invalid -> REJECT with reason', () => {
    const result = evaluateGate({
      testsPassed: true,
      mutationScore: 90,
      scopeViolations: 0,
      hashValid: false
    });
    expect(result.verdict).toBe('REJECT');
    expect(result.reasons).toContain('Hash validation failed');
  });

  test('Multiple failures -> REJECT with all reasons', () => {
    const result = evaluateGate({
      testsPassed: false,
      mutationScore: 80,
      scopeViolations: 1,
      hashValid: false
    });
    expect(result.verdict).toBe('REJECT');
    expect(result.reasons.length).toBe(4);
  });

  test('Custom mutation threshold works', () => {
    const result = evaluateGate({
      testsPassed: true,
      mutationScore: 80,
      scopeViolations: 0,
      hashValid: true,
      mutationThreshold: 75
    });
    expect(result.verdict).toBe('PASS');
  });

  test('Mutation score exactly at threshold -> PASS', () => {
    const result = evaluateGate({
      testsPassed: true,
      mutationScore: 85,
      scopeViolations: 0,
      hashValid: true
    });
    expect(result.verdict).toBe('PASS');
  });

  test('Mutation score one below threshold -> REJECT', () => {
    const result = evaluateGate({
      testsPassed: true,
      mutationScore: 84,
      scopeViolations: 0,
      hashValid: true
    });
    expect(result.verdict).toBe('REJECT');
  });
});
