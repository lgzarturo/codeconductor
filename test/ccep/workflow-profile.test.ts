import { describe, expect, test } from 'bun:test';
import { CCEP_COMMANDS } from '../../src/core/ccep/command-parser';
import {
  loadWorkflowProfile,
  loadAllWorkflowProfiles,
} from '../../src/core/ccep/workflow-profile-loader';
import { validateWorkflowProfile } from '../../src/validation/schemas';

describe('ccep workflow profiles', () => {
  test('registry contains a valid profile for each of the 19 commands', () => {
    const profiles = loadAllWorkflowProfiles();

    expect(profiles.size).toBe(19);
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
      'wayfinding',
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

  test('security profile mirrors fix risk-based routing with authorization gate', () => {
    const profile = loadWorkflowProfile('security');

    expect(profile.id).toBe('security');
    expect(profile.taskCard?.requiredFields).toContain('domain');
    expect(profile.taskCard?.requiredFields).toContain('authorization');
    expect(profile.routing.riskRules?.length).toBeGreaterThan(0);

    const lowRule = profile.routing.riskRules?.find((r) => r.when.risk === 'low');
    const highRule = profile.routing.riskRules?.find((r) =>
      Array.isArray(r.when.risk) ? r.when.risk.includes('high') : r.when.risk === 'high',
    );

    expect(lowRule?.then).toContain('implement');
    expect(lowRule?.then).not.toContain('review');
    expect(highRule?.then).toContain('review');
  });

  test('council profile defines SDD → TDD → implement → council review', () => {
    const profile = loadWorkflowProfile('council');

    expect(profile.phases.map((p) => p.id)).toEqual([
      'wayfinding',
      'deliberation',
      'tdd',
      'implement',
      'council-review',
    ]);
    expect(profile.phases[1]?.outputSchema).toBe('planner-output');
    expect(profile.phases[4]?.outputSchema).toBe('council-verdict');
  });

  test('iterative profile is wayfinding → intake → contract → design → TDD → council → docs', () => {
    const profile = loadWorkflowProfile('iterative');

    expect(profile.phases.map((p) => p.id)).toEqual([
      'wayfinding',
      'intake',
      'contract',
      'design',
      'test',
      'implement',
      'council-review',
      'docs',
    ]);
    expect(profile.confirmationGate.stopOnQuestions).toBe(true);
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

  test('explore profile is map then suggest-next', () => {
    const profile = loadWorkflowProfile('explore');
    expect(profile.phases.map((p) => p.id)).toEqual(['map', 'suggest-next']);
    expect(profile.phases[0]?.agent).toBe('repo-explorer');
  });

  test('triage, prototype, handoff, and clarify profiles load', () => {
    expect(loadWorkflowProfile('triage').phases[0]?.id).toBe('classify');
    expect(loadWorkflowProfile('prototype').routing.default).toEqual(['bounds', 'spike']);
    expect(loadWorkflowProfile('handoff').phases[0]?.agent).toBe('docs');
    expect(loadWorkflowProfile('handoff').confirmationGate.stopOnHighRisk).toBe(true);
    expect(loadWorkflowProfile('clarify').confirmationGate.stopOnQuestions).toBe(true);
  });
});
