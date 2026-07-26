/**
 * Tests for execution profile resolution.
 */
import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolvePhaseModels } from '../src/core/evaluation/execution-profile';

let TEST_DIR: string;

describe('execution-profile', () => {
  test('resolvePhaseModels returns all phases', async () => {
    TEST_DIR = await mkdtemp(join(tmpdir(), 'cc-exec-profile-'));
    const result = await resolvePhaseModels(TEST_DIR, 'opencode');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.length).toBe(5);
    expect(result.data.map((r) => r.phase)).toContain('discover');
    expect(result.data.every((r) => r.model && r.model !== 'unknown')).toBe(true);
    await rm(TEST_DIR, { recursive: true, force: true });
  });
});
