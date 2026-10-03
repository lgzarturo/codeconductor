import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadBacklogSession,
  BacklogSessionError,
} from '../../../../src/core/openspec/backlog-session';
import { buildItemSnapshot } from '../../../../src/core/openspec/backlog-scanner';
import { parseBacklogMarkdown } from '../../../../src/core/openspec/backlog-parser';
import { isErr, isOk } from '../../../../src/utils/result';

const VALID = `## Global
- Product: MyProd
- Strategy: Ship fast
- Policy: TDD
- Review Required: yes
- TDD Required: no

## Items
### BC-001 | First feature
- Priority: P1
- Status: READY
- Type: feature
- Depends on: none
- Description: Do the thing
- Scope: module x
- Acceptance:
  - [ ] Criterion one is measurable
- Progress: 0%

## Archive
`;

const INVALID = `## Global
- Product: MyProd
- Strategy: Ship fast
- Policy: TDD

## Items
### BC-001 | Unknown dependency
- Priority: P1
- Status: READY
- Type: feature
- Depends on: BC-999
- Description: Do the thing
- Scope: module x
- Acceptance:
  - [ ] Criterion one is measurable

## Archive
`;

let ROOT: string;

beforeAll(async () => {
  ROOT = await mkdtemp(join(tmpdir(), 'cc-backlog-session-'));
});

afterAll(async () => {
  await rm(ROOT, { recursive: true, force: true });
});

async function writeBacklog(dir: string, content: string): Promise<void> {
  await writeFile(join(dir, 'BACKLOG.md'), content, 'utf-8');
}

describe('core/openspec/backlog-session', () => {
  test('loads raw, doc, state, scan and report in one call', async () => {
    const dir = await mkdtemp(join(ROOT, 'valid-'));
    await writeBacklog(dir, VALID);

    const result = await loadBacklogSession(dir);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;

    const session = result.data;
    expect(session.raw).toContain('### BC-001 | First feature');
    expect(session.doc.items.map((i) => i.id)).toEqual(['BC-001']);
    expect(session.doc.global.tddRequired).toBe(false);
    expect(session.report.valid).toBe(true);
    expect(session.state.taskCards).toEqual([]);
    expect(session.scan.newItems).toContain('BC-001');
    expect(typeof session.scan.contentHash).toBe('string');
  });

  test('defaults state when .codeconductor is missing', async () => {
    const dir = await mkdtemp(join(ROOT, 'nostate-'));
    await writeBacklog(dir, VALID);

    const result = await loadBacklogSession(dir);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.data.state).toMatchObject({
      version: 1,
      taskCards: [],
      changePaths: {},
    });
  });

  test('invalid backlog fails with BacklogSessionError carrying doc, report and state', async () => {
    const dir = await mkdtemp(join(ROOT, 'invalid-'));
    await writeBacklog(dir, INVALID);

    const result = await loadBacklogSession(dir);
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;

    expect(result.error).toBeInstanceOf(BacklogSessionError);
    const error = result.error as BacklogSessionError;
    expect(error.report.valid).toBe(false);
    expect(error.report.errors.map((e) => e.code)).toContain('UNKNOWN_DEPENDENCY');
    expect(error.doc.items.map((i) => i.id)).toEqual(['BC-001']);
    expect(error.state.taskCards).toEqual([]);
  });

  test('missing BACKLOG.md fails with a plain Error', async () => {
    const dir = await mkdtemp(join(ROOT, 'missing-'));

    const result = await loadBacklogSession(dir);
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error).not.toBeInstanceOf(BacklogSessionError);
  });

  test('scan diff reflects modified items vs persisted snapshots', async () => {
    const dir = await mkdtemp(join(ROOT, 'diff-'));
    await writeBacklog(dir, VALID);

    const parsed = parseBacklogMarkdown(VALID);
    expect(isOk(parsed)).toBe(true);
    if (!isOk(parsed)) return;
    const snapshots = buildItemSnapshot(parsed.data.items, parsed.data.archive);

    await mkdir(join(dir, '.codeconductor'), { recursive: true });
    await writeFile(
      join(dir, '.codeconductor', 'openspec-state.json'),
      JSON.stringify({ version: 1, taskCards: [], changePaths: {}, itemSnapshots: snapshots }),
      'utf-8'
    );

    const evolved = VALID.replace('Do the thing', 'Do the other thing');
    await writeBacklog(dir, evolved);

    const result = await loadBacklogSession(dir);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.data.scan.newItems).toEqual([]);
    expect(result.data.scan.modifiedItems).toEqual(['BC-001']);
  });
});
