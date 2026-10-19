/**
 * Telemetry store — history:false writes nothing; privacy scrubbing.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBaseEvent } from '../../src/core/telemetry/schema';
import {
  appendRunReport,
  appendTelemetryEvent,
  applyPrivacy,
  readTelemetryRun,
  resolveReportSettings,
  telemetryRunPath,
} from '../../src/core/telemetry/store';

let ROOT: string;

describe('telemetry store', () => {
  beforeEach(async () => {
    ROOT = await mkdtemp(join(tmpdir(), 'cc-telemetry-'));
    await mkdir(join(ROOT, '.codeconductor'), { recursive: true });
  });

  afterEach(async () => {
    await rm(ROOT, { recursive: true, force: true });
    delete process.env.CC_REPORT_HISTORY;
  });

  test('history:false writes nothing', async () => {
    const event = createBaseEvent({ runId: 'r-nohist', event: 'run.end' });
    const result = await appendTelemetryEvent(ROOT, event, { history: false });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.written).toBe(false);
    expect(result.data.path).toBeNull();

    let exists = true;
    try {
      await access(telemetryRunPath(ROOT, 'r-nohist'));
    } catch {
      exists = false;
    }
    expect(exists).toBe(false);

    const report = await appendRunReport(ROOT, { schemaVersion: 1, runId: 'r-nohist' }, {
      history: false,
    });
    expect(report.success).toBe(true);
    if (!report.success) return;
    expect(report.data.written).toBe(false);
  });

  test('history:false from project config wins', async () => {
    await writeFile(
      join(ROOT, '.codeconductor', 'config.yml'),
      ['version: "0.2.0"', 'report:', '  history: false', '  level: minimal'].join('\n'),
      'utf-8',
    );
    const settings = await resolveReportSettings(ROOT);
    expect(settings.history).toBe(false);

    const event = createBaseEvent({ runId: 'r-cfg', event: 'run.start' });
    const result = await appendTelemetryEvent(ROOT, event);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.written).toBe(false);
  });

  test('writes jsonl when history is true', async () => {
    const event = createBaseEvent({ runId: 'r-ok', event: 'run.end' });
    event.usage = {
      input: 10,
      output: 5,
      cacheRead: null,
      cacheWrite: null,
      reasoning: null,
      calls: null,
      apiRetries: null,
    };
    const result = await appendTelemetryEvent(ROOT, event);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.written).toBe(true);

    const listed = await readTelemetryRun(ROOT, 'r-ok');
    expect(listed.success).toBe(true);
    if (!listed.success) return;
    expect(listed.data.length).toBe(1);
    expect(listed.data[0].usage!.cacheRead).toBeNull();

    const raw = await readFile(telemetryRunPath(ROOT, 'r-ok'), 'utf-8');
    expect(raw.includes('"cacheRead":null')).toBe(true);
  });

  test('strict privacy hashes retryReason and clears model id', () => {
    const event = createBaseEvent({ runId: 'r-p', event: 'retry' });
    event.model = { id: 'claude-sonnet-5-5', provider: 'anthropic', effort: null };
    event.loop = {
      iteration: 1,
      retryReason: 'tests failed in src/core/foo.ts: line 12',
      maxIterations: 3,
    };
    const scrubbed = applyPrivacy(event, 'strict');
    expect(scrubbed.model!.id).toBeNull();
    expect(scrubbed.loop!.retryReason!.startsWith('sha256:')).toBe(true);
  });
});
