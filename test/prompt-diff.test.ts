/**
 * Tests for prompt diff.
 */
import { describe, expect, test } from 'bun:test';
import { diffPromptVersions } from '../src/core/evaluation/prompt-diff';

describe('prompt-diff', () => {
  test('diffPromptVersions returns structure', async () => {
    const result = await diffPromptVersions('0.4.0', '0.4.0', { target: 'opencode' });
    expect(result.fromVersion).toBe('v0.4.0');
    expect(result.toVersion).toBe('v0.4.0');
    expect(Array.isArray(result.files)).toBe(true);
  });
});
