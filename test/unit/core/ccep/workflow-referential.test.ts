import { describe, expect, test } from 'bun:test';
import { checkWorkflowReferentialIntegrity } from '../../../../src/core/ccep/workflow-referential';
import { PACKAGE_ROOT } from '../../../../src/core/presets/package-paths';

describe('workflow-referential', () => {
  test('package workflows have no referential failures', async () => {
    const report = await checkWorkflowReferentialIntegrity(PACKAGE_ROOT);
    expect(report.profilesChecked).toBeGreaterThan(0);
    expect(report.findings.filter((f) => f.severity === 'fail')).toEqual([]);
  });
});
