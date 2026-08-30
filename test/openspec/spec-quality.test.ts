import { describe, expect, test } from 'bun:test';
import { assessSpecMarkdown } from '../../src/core/openspec/spec-quality';

const VALID = `# Delta for Search

## ADDED Requirements

### Requirement: FR-001 Site search

The system MUST return results that match the query.

#### Scenario: SC-001 Happy path

- GIVEN an indexed catalog
- WHEN the user searches for a known term
- THEN matching results are returned
`;

describe('spec-quality', () => {
  test('accepts RFC 2119, GWT, and FR/SC ids', () => {
    const report = assessSpecMarkdown(VALID, 'openspec/changes/x/specs/delta.md');
    expect(report.valid).toBe(true);
    expect(report.requirements.map((r) => r.id)).toContain('FR-001');
    expect(report.successCriteria.map((s) => s.id)).toContain('SC-001');
    expect(report.stopForClarify).toBe(false);
  });

  test('rejects missing RFC 2119', () => {
    const md = VALID.replace('MUST', 'will');
    const report = assessSpecMarkdown(md, 'specs/delta.md');
    expect(report.valid).toBe(false);
    expect(report.issues.some((i) => i.code === 'MISSING_RFC2119')).toBe(true);
  });

  test('rejects missing Given/When/Then', () => {
    const md = VALID.replace('- GIVEN', '- given that').replace('- WHEN', '- after').replace(
      '- THEN',
      '- expect',
    );
    const report = assessSpecMarkdown(md, 'specs/delta.md');
    expect(report.valid).toBe(false);
    expect(report.issues.some((i) => i.code === 'MISSING_GWT')).toBe(true);
  });

  test('rejects missing FR/SC ids', () => {
    const md = VALID.replaceAll('FR-001', 'Search').replaceAll('SC-001', 'Happy');
    const report = assessSpecMarkdown(md, 'specs/delta.md');
    expect(report.valid).toBe(false);
    expect(report.issues.some((i) => i.code === 'MISSING_TRACE_IDS')).toBe(true);
  });

  test('rejects more than 3 NEEDS CLARIFICATION markers', () => {
    const extra = [
      '[NEEDS CLARIFICATION: a]',
      '[NEEDS CLARIFICATION: b]',
      '[NEEDS CLARIFICATION: c]',
      '[NEEDS CLARIFICATION: d]',
    ].join('\n');
    const report = assessSpecMarkdown(`${VALID}\n${extra}`, 'specs/delta.md');
    expect(report.valid).toBe(false);
    expect(report.issues.some((i) => i.code === 'TOO_MANY_CLARIFICATIONS')).toBe(true);
  });

  test('1-3 clarifications stay valid but request a clarify stop', () => {
    const report = assessSpecMarkdown(
      `${VALID}\n[NEEDS CLARIFICATION: ranking]`,
      'specs/delta.md',
    );
    expect(report.valid).toBe(true);
    expect(report.stopForClarify).toBe(true);
    expect(report.needsClarificationCount).toBe(1);
  });

  test('rejects leftover placeholders', () => {
    const report = assessSpecMarkdown(
      `${VALID}\n(To be completed in design phase.)`,
      'specs/delta.md',
    );
    expect(report.valid).toBe(false);
    expect(report.issues.some((i) => i.code === 'PLACEHOLDER')).toBe(true);
  });
});
