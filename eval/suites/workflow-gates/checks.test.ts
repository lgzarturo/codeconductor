import { describe, expect, test } from 'bun:test';
import { assessSpecMarkdown } from '../../../src/core/openspec/spec-quality';

describe('workflow-gates — spec quality', () => {
  test('placeholder spec without RFC 2119 or FR/SC is invalid', () => {
    const report = assessSpecMarkdown(
      '# Change\n\n(To be completed)\n\nImprove the UX.\n',
      'specs/delta.md'
    );
    expect(report.valid).toBe(false);
    expect(report.issues.length).toBeGreaterThan(0);
  });

  test('measurable spec with RFC 2119 and ids is valid enough to proceed', () => {
    const report = assessSpecMarkdown(
      [
        '### Requirement: FR-001 Login',
        '',
        'The system MUST reject empty passwords.',
        '',
        'GIVEN a login form WHEN the password is empty THEN the API returns 400.',
        '',
        'SC-001 Empty password is rejected.',
      ].join('\n'),
      'specs/auth.md'
    );
    expect(report.valid).toBe(true);
  });
});
