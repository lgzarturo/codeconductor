/**
 * Adversarial RED scaffold — turns the SDD edge-case matrix into a runnable
 * failing suite (one strict case per edge, E-### ids mirroring the test-plan
 * Edge Cases table). Cases throw until the tester wires real assertions, so
 * the suite stays red and no edge can be silently skipped.
 */

import type { EdgeCaseInput } from '../../validation/schemas';

function sanitizeInline(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, ' ').trim();
}

export function generateAdversarialSuite(matrix: readonly EdgeCaseInput[]): string {
  const cases = matrix.map((edge, index) => {
    const id = `E-${String(index + 1).padStart(3, '0')}`;
    const scenario = sanitizeInline(edge.scenario);
    const input = sanitizeInline(edge.input);
    const expected = sanitizeInline(edge.expected);
    return [
      `test('${id} ${scenario}', () => {`,
      `  // input: ${input}`,
      `  // expected: ${expected}`,
      `  throw new Error('${id} not wired: replace with the adversarial assertion');`,
      `});`,
    ].join('\n');
  });
  return [
    '// Adversarial RED scaffold — generated from the SDD edge-case matrix.',
    '// Each case FAILS until the tester wires real assertions. Do not weaken:',
    '// wire the production call, keep the expectation strict.',
    "import { test } from 'bun:test';",
    '',
    ...cases,
    '',
  ].join('\n');
}
