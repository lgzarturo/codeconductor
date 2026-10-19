/**
 * Outcomes write path moved off the versioned evaluation/outcomes.jsonl.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendOutcome, listOutcomes } from '../../src/core/evaluation/outcome-store';

let ROOT: string;

describe('outcome write path (M1)', () => {
  beforeEach(async () => {
    ROOT = await mkdtemp(join(tmpdir(), 'cc-outcomes-'));
  });

  afterEach(async () => {
    await rm(ROOT, { recursive: true, force: true });
  });

  test('appendOutcome writes under .codeconductor/telemetry/, not evaluation/', async () => {
    const write = await appendOutcome(ROOT, {
      id: 'out-new-1',
      taskId: 'T1',
      source: 'openspec',
      agent: 'implementer',
      model: 'claude-sonnet-5-5',
      contractVersion: '1.0.0',
      timestamp: '2026-10-19T00:00:00Z',
      tokensIn: 10,
      tokensOut: 5,
      cacheRead: null,
      cacheWrite: 3,
      calls: null,
      iterations: 2,
      retries: 1,
      usageSource: 'cc-json',
      pricingVersion: 'pricing/v1',
    });
    expect(write.success).toBe(true);

    const newPath = join(ROOT, '.codeconductor', 'telemetry', 'outcomes.jsonl');
    const legacyPath = join(ROOT, '.codeconductor', 'evaluation', 'outcomes.jsonl');
    const content = await readFile(newPath, 'utf-8');
    expect(content.includes('out-new-1')).toBe(true);
    expect(content.includes('"cacheRead":null')).toBe(true);

    let legacyExists = true;
    try {
      await access(legacyPath);
    } catch {
      legacyExists = false;
    }
    expect(legacyExists).toBe(false);

    const listed = await listOutcomes(ROOT);
    expect(listed.success).toBe(true);
    if (!listed.success) return;
    expect(listed.data.length).toBe(1);
    expect(listed.data[0].cacheWrite).toBe(3);
    expect(listed.data[0].cacheRead).toBeNull();
  });

  test('listOutcomes still reads legacy evaluation/outcomes.jsonl', async () => {
    const legacyDir = join(ROOT, '.codeconductor', 'evaluation');
    await mkdir(legacyDir, { recursive: true });
    await writeFile(
      join(legacyDir, 'outcomes.jsonl'),
      JSON.stringify({
        id: 'legacy-1',
        taskId: 'T-legacy',
        source: 'review',
        agent: 'reviewer',
        model: 'human',
        contractVersion: '1.0.0',
        timestamp: '2026-01-01T00:00:00Z',
        verdict: 'PASS',
      }) + '\n',
      'utf-8',
    );

    const listed = await listOutcomes(ROOT, { agent: 'reviewer' });
    expect(listed.success).toBe(true);
    if (!listed.success) return;
    expect(listed.data.length).toBe(1);
    expect(listed.data[0].id).toBe('legacy-1');
  });
});
