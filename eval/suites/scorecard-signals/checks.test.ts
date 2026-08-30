import { describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadTddSuiteEvidence } from '../../../src/core/verification/verification-runner';

describe('scorecard-signals — handmade TDD evidence', () => {
  test('handmade JSON is rejected', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cc-suite-'));
    const evDir = join(root, '.codeconductor', 'evidence');
    await mkdir(evDir, { recursive: true });
    await writeFile(
      join(evDir, 'ev-handmade.json'),
      JSON.stringify({
        id: 'ev-handmade',
        type: 'note',
        source: 'manual',
        relatedTask: 'BC-001',
        timestamp: new Date().toISOString(),
        confidence: 1,
        data: { suiteFailed: true, suitePassed: true },
      }),
      'utf-8'
    );
    const loaded = await loadTddSuiteEvidence(root, 'BC-001', 'ev-handmade');
    expect(loaded.success).toBe(false);
  });
});
