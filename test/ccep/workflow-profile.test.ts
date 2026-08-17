import { describe, expect, test } from 'bun:test';
import { CCEP_COMMANDS } from '../../src/core/ccep/command-parser';
import {
  loadWorkflowProfile,
  loadAllWorkflowProfiles,
} from '../../src/core/ccep/workflow-profile-loader';
import { validateWorkflowProfile } from '../../src/validation/schemas';

describe('ccep workflow profiles', () => {
  test('registry contains a valid profile for each of the 12 commands', () => {
    const profiles = loadAllWorkflowProfiles();

    expect(profiles.size).toBe(12);
    for (const command of CCEP_COMMANDS) {
      expect(profiles.has(command)).toBe(true);
      const profile = profiles.get(command)!;
      expect(() => validateWorkflowProfile(profile)).not.toThrow();
      expect(profile.command).toBe(command);
    }
  });

  test('feature profile defines full delivery phases', () => {
    const profile = loadWorkflowProfile('feature');

    expect(profile.id).toBe('feature');
    expect(profile.phases.map((p) => p.id)).toEqual([
      'intake',
      'design',
      'test',
      'implement',
      'review',
      'docs',
    ]);
    expect(profile.taskCard?.type).toBe('feature');
    expect(profile.taskCard?.requiredFields).toContain('acceptanceCriteria');
    expect(profile.confirmationGate.stopOnHighRisk).toBe(true);
  });

  test('fix profile defines risk-based routing', () => {
    const profile = loadWorkflowProfile('fix');

    expect(profile.id).toBe('fix');
    expect(profile.taskCard?.requiredFields).toContain('reproductionSteps');
    expect(profile.routing.riskRules?.length).toBeGreaterThan(0);

    const lowRule = profile.routing.riskRules?.find((r) => r.when.risk === 'low');
    const highRule = profile.routing.riskRules?.find((r) =>
      Array.isArray(r.when.risk) ? r.when.risk.includes('high') : r.when.risk === 'high',
    );

    expect(lowRule?.then).toContain('implement');
    expect(highRule?.then).toContain('review');
  });

  test('council profile defines SDD → TDD → implement → council review', () => {
    const profile = loadWorkflowProfile('council');

    expect(profile.phases.map((p) => p.id)).toEqual([
      'deliberation',
      'tdd',
      'implement',
      'council-review',
    ]);
    expect(profile.phases[0]?.outputSchema).toBe('planner-output');
    expect(profile.phases[3]?.outputSchema).toBe('council-verdict');
  });

  test('review profile uses review-target intake — not standard task card', () => {
    const profile = loadWorkflowProfile('review');

    expect(profile.intakeSchema).toBe('review-target');
    expect(profile.taskCard).toBeUndefined();
    expect(profile.phases[0]?.id).toBe('diff-collection');
    expect(profile.phases[1]?.agent).toBe('reviewer');
  });

  test('pagespeed profile uses url intake schema', () => {
    const profile = loadWorkflowProfile('pagespeed');

    expect(profile.intakeSchema).toBe('pagespeed-url');
    expect(profile.phases.some((p) => p.id === 'psi-fetch')).toBe(true);
  });

  test('openspec profile references CLI gate phase', () => {
    const profile = loadWorkflowProfile('openspec');

    expect(profile.phases[0]?.id).toBe('validate-backlog');
    expect(profile.phases.some((p) => p.agent === 'repo-explorer')).toBe(true);
  });
});
