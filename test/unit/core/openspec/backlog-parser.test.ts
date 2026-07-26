import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BACKLOG_FILENAME,
  loadBacklog,
  parseBacklogMarkdown,
} from '../../../../src/core/openspec/backlog-parser';
import { isErr, isOk } from '../../../../src/utils/result';

const VALID = `## Global
- Product: MyProd
- Strategy: Ship fast
- Policy: TDD
- Review Required: yes
- TDD Required: yes

## Items
### BC-001 | First feature
- Priority: P1
- Status: ready
- Type: feature
- Depends on: none
- Description: Do the thing
- Scope: module x
- Acceptance:
  - [ ] Criterion one is measurable
  - [ ] Criterion two is measurable
- Progress: 150%

## Archive
### BC-000 | Old feature
- Status: DONE
- Description: legacy
- Scope: old
- Acceptance:
  - [x] Was done
`;

let ROOT: string;

beforeAll(async () => {
  ROOT = await mkdtemp(join(tmpdir(), 'cc-backlog-parser-'));
});

afterAll(async () => {
  await rm(ROOT, { recursive: true, force: true });
});

describe('core/openspec/backlog-parser', () => {
  describe('parseBacklogMarkdown', () => {
    test('parses global config, items and archive', () => {
      const result = parseBacklogMarkdown(VALID);
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      const doc = result.data;
      expect(doc.global).toMatchObject({ product: 'MyProd', strategy: 'Ship fast', policy: 'TDD', reviewRequired: true });

      const item = doc.items[0];
      expect(item.id).toBe('BC-001');
      expect(item.title).toBe('First feature');
      expect(item.status).toBe('READY');
      expect(item.priority).toBe('P1');
      expect(item.dependencies).toEqual([]);
      expect(item.acceptanceCriteria).toHaveLength(2);
      expect(item.progress).toBe(100);

      expect(doc.archive[0].id).toBe('BC-000');
      expect(doc.archive[0].status).toBe('DONE');
    });

    test('errors when required Global fields are missing', () => {
      const result = parseBacklogMarkdown('## Items\n### BC-001 | X\n- Description: d\n');
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain('missing required Global fields');
      }
    });
  });

  describe('loadBacklog', () => {
    test('loads and parses BACKLOG.md from disk', async () => {
      const dir = await mkdtemp(join(ROOT, 'proj-'));
      await writeFile(join(dir, BACKLOG_FILENAME), VALID);
      const result = await loadBacklog(dir);
      expect(isOk(result)).toBe(true);
    });

    test('errors when BACKLOG.md is absent', async () => {
      const dir = await mkdtemp(join(ROOT, 'empty-'));
      expect(isErr(await loadBacklog(dir))).toBe(true);
    });
  });
});
