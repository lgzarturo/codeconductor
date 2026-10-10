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
  test('scenario names containing an FR reference keep a stable scenario slug', () => {
    const report = assessSpecMarkdown('## ADDED Requirements\n### Requirement: State\nThe system SHALL report state.\n#### Scenario: FR-001 regression\n- WHEN requested\n- THEN state appears\n', 'specs/api/spec.md');
    expect(report.valid).toBe(true);
    expect(report.requirements.map((requirement) => requirement.id)).toEqual(['req:api/state']);
    expect(report.successCriteria.map((scenario) => scenario.id)).toEqual(['req:api/state#fr-001-regression']);
  });

  test('does not require SC IDs for removed or renamed legacy FR requirements', () => {
    for (const markdown of [
      '## REMOVED Requirements\n### Requirement: FR-001 Old login\n**Reason**: Replaced.\n',
      '## RENAMED Requirements\n- FROM: `### Requirement: FR-001 Old login`\n- TO: `### Requirement: FR-001 Member login`\n',
    ]) {
      expect(assessSpecMarkdown(markdown, 'specs/auth/spec.md').valid).toBe(true);
    }
  });

  test('rejects empty requirement names, empty slugs and empty rename destinations', () => {
    for (const name of ['', '!!!']) {
      const report = assessSpecMarkdown(`## ADDED Requirements\n### Requirement: ${name}\nThe system SHALL respond.\n#### Scenario: Response\n- WHEN called\n- THEN responds\n`, 'specs/api/spec.md');
      expect(report.valid).toBe(false);
      expect(report.issues.map((issue) => issue.code)).toContain('INVALID_REQUIREMENT_NAME');
    }
    const rename = assessSpecMarkdown('## RENAMED Requirements\n- FROM: `### Requirement: Login`\n- TO: `### Requirement: `\n', 'specs/api/spec.md');
    expect(rename.valid).toBe(false);
    expect(rename.issues.map((issue) => issue.code)).toContain('MALFORMED_RENAME');
  });

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

  test('rejects missing SC ids for legacy FR requirements', () => {
    const md = VALID.replaceAll('SC-001', 'Happy');
    const report = assessSpecMarkdown(md, 'specs/delta.md');
    expect(report.valid).toBe(false);
    expect(report.issues.some((i) => i.code === 'MISSING_TRACE_IDS')).toBe(true);
  });

  test('accepts official named requirements with WHEN/THEN and capability IDs', () => {
    const report = assessSpecMarkdown('## ADDED Requirements\n### Requirement: Site search\nThe system SHALL return matching results.\n#### Scenario: Happy path\n- **WHEN** the user searches\n- **THEN** matching results are returned\n', 'openspec/changes/search/specs/search/spec.md');
    expect(report.valid).toBe(true);
    expect(report.requirements.map((requirement) => requirement.id)).toEqual(['req:search/site-search']);
    expect(report.successCriteria.map((scenario) => scenario.id)).toEqual(['req:search/site-search#happy-path']);
  });

  test('validates removed and renamed deltas without requiring behavioral scenarios', () => {
    const path = 'openspec/changes/search/specs/search/spec.md';
    const removed = assessSpecMarkdown('## REMOVED Requirements\n### Requirement: Site search\n**Reason**: Replaced.\n', path);
    const renamed = assessSpecMarkdown('## RENAMED Requirements\n- FROM: `### Requirement: Site search`\n- TO: `### Requirement: Catalog search`\n', path);
    const malformed = assessSpecMarkdown('## RENAMED Requirements\n- FROM: `### Requirement: Site search`\n\n## ADDED Requirements\n### Requirement: New search\nThe system SHALL search.\n#### Scenario: Found\n- WHEN searching\n- THEN results appear\n', path);
    expect(removed.valid).toBe(true);
    expect(renamed.valid).toBe(true);
    expect(malformed.valid).toBe(false);
    expect(malformed.issues.map((issue) => issue.code)).toContain('MALFORMED_RENAME');
  });

  test('preserves both legacy and official requirements in the same capability', () => {
    const report = assessSpecMarkdown(`${VALID}\n### Requirement: Catalog browse\nThe system SHALL show the catalog.\n#### Scenario: Browse\n- WHEN catalog is requested\n- THEN catalog is shown\n`, 'specs/search/spec.md');
    expect(report.valid).toBe(true);
    expect(report.requirements.map((requirement) => requirement.id)).toEqual(['FR-001', 'req:search/catalog-browse']);
    expect(report.successCriteria.map((scenario) => scenario.id)).toEqual(['SC-001', 'req:search/catalog-browse#browse']);
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
