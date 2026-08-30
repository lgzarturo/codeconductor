import { describe, expect, test } from 'bun:test';
import { analyzeSpecArtifacts } from '../../src/core/openspec/spec-analyzer';
import { SpecAnalyzeReportSchema } from '../../src/validation/schemas';

const SPEC = `# Delta

### Requirement: FR-001 Parser

The system MUST parse BACKLOG.md.

#### Scenario: SC-001 Valid file

- GIVEN a well-formed BACKLOG.md
- WHEN openspec validate runs
- THEN the document is accepted
`;

const TASKS = `# Tasks

- [ ] Write failing test for FR-001 (test)
- [ ] Implement FR-001 parser
- [ ] Cover SC-001
`;

describe('spec-analyze', () => {
  test('reports FR/SC coverage and matches the JSON schema', () => {
    const report = analyzeSpecArtifacts({
      changePath: 'openspec/changes/bc-001-parser',
      specMarkdown: SPEC,
      tasksMarkdown: TASKS,
      tddRequired: true,
      hasTddEvidence: true,
    });

    expect(report.frIds).toEqual(['FR-001']);
    expect(report.scIds).toEqual(['SC-001']);
    expect(report.mappedFr).toEqual(['FR-001']);
    expect(report.mappedToTests).toEqual(['FR-001']);
    expect(report.frCoveragePct).toBe(100);
    expect(report.testCoveragePct).toBe(100);
    expect(report.stop).toBe(false);

    const parsed = SpecAnalyzeReportSchema.parse(report);
    expect(parsed.changePath).toBe(report.changePath);
  });

  test('CRITICAL when TDD is required and an FR has no test task', () => {
    const report = analyzeSpecArtifacts({
      changePath: 'openspec/changes/bc-001-parser',
      specMarkdown: SPEC,
      tasksMarkdown: '- [ ] Implement FR-001 parser\n- [ ] Cover SC-001',
      tddRequired: true,
    });

    expect(report.stop).toBe(true);
    expect(report.findings.some((f) => f.code === 'TDD_FR_UNTESTED')).toBe(true);
    expect(report.findings.some((f) => f.severity === 'CRITICAL')).toBe(true);
  });

  test('CRITICAL when design conflicts with a MUST policy', () => {
    const report = analyzeSpecArtifacts({
      changePath: 'openspec/changes/bc-001-parser',
      specMarkdown: SPEC,
      tasksMarkdown: TASKS,
      designMarkdown: 'We will skip TDD for this change.',
      policyText: 'Agents MUST follow TDD when Global TDD required is yes.',
      tddRequired: true,
      hasTddEvidence: true,
    });

    expect(report.stop).toBe(true);
    expect(report.findings.some((f) => f.code === 'POLICY_CONFLICT')).toBe(true);
  });
});
