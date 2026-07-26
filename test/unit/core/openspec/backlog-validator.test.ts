import { describe, expect, test } from 'bun:test';
import { validateBacklog } from '../../../../src/core/openspec/backlog-validator';
import type { BacklogDocumentInput, BacklogItemInput } from '../../../../src/validation/schemas';

const item = (over: Partial<BacklogItemInput> = {}): BacklogItemInput => ({
  id: 'BC-001',
  title: 'T',
  priority: 'P1',
  status: 'TODO',
  type: 'feature',
  dependencies: [],
  description: 'A real description',
  scope: 'a real scope',
  outOfScope: '',
  acceptanceCriteria: ['A clearly measurable acceptance criterion'],
  progress: 0,
  ...over,
});

const doc = (items: BacklogItemInput[], archive: BacklogItemInput[] = []): BacklogDocumentInput => ({
  global: { product: 'P', strategy: 'S', policy: 'PO', reviewRequired: true, tddRequired: true },
  items,
  archive,
});

const codes = (d: BacklogDocumentInput) => validateBacklog(d).errors.map((e) => e.code);

describe('core/openspec/backlog-validator', () => {
  test('a well-formed backlog is valid', () => {
    const report = validateBacklog(doc([item()]));
    expect(report.valid).toBe(true);
    expect(report.errors).toEqual([]);
  });

  test('detects duplicate IDs', () => {
    expect(codes(doc([item(), item()]))).toContain('DUPLICATE_ID');
  });

  test('flags whitespace-only description and scope', () => {
    const c = codes(doc([item({ description: ' ', scope: ' ' })]));
    expect(c).toContain('MISSING_DESCRIPTION');
    expect(c).toContain('MISSING_SCOPE');
  });

  test('flags vague acceptance criteria', () => {
    expect(codes(doc([item({ acceptanceCriteria: ['short'] })]))).toContain('VAGUE_ACCEPTANCE');
  });

  test('flags unknown dependencies', () => {
    expect(codes(doc([item({ dependencies: ['BC-999'] })]))).toContain('UNKNOWN_DEPENDENCY');
  });

  test('detects a dependency cycle', () => {
    const a = item({ id: 'BC-001', dependencies: ['BC-002'] });
    const b = item({ id: 'BC-002', dependencies: ['BC-001'] });
    expect(codes(doc([a, b]))).toContain('DEPENDENCY_CYCLE');
  });

  test('recommends adding items when the backlog is empty', () => {
    const report = validateBacklog(doc([]));
    expect(report.valid).toBe(true);
    expect(report.recommendations.length).toBeGreaterThan(0);
  });

  test('reports a schema error for a malformed item id', () => {
    const bad = doc([item({ id: 'X-1' })]);
    const report = validateBacklog(bad);
    expect(report.valid).toBe(false);
    expect(report.errors[0].code).toBe('SCHEMA');
    expect(report.recommendations.length).toBeGreaterThan(0);
  });
});
