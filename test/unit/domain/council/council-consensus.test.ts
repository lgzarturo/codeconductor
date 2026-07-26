import { describe, expect, test } from 'bun:test';
import {
  councilConsensus,
  type ConsensusConfig,
  type CouncilVerdictInput,
} from '../../../../src/domain/council/council-consensus';

function verdict(overrides: Partial<CouncilVerdictInput> = {}): CouncilVerdictInput {
  return {
    agentId: 'a1',
    agentRole: 'reviewer',
    status: 'APPROVED',
    securityVeto: false,
    complianceVeto: false,
    confidence: 1,
    findings: [],
    summary: 'ok',
    ...overrides,
  };
}

describe('domain/council/council-consensus', () => {
  test('empty input escalates for human review', () => {
    const v = councilConsensus([]);
    expect(v.status).toBe('ESCALATED');
    expect(v.totalAgents).toBe(0);
    expect(v.individualVerdicts).toEqual([]);
  });

  test('majority: more approvals than rejections approves', () => {
    const v = councilConsensus([
      verdict({ agentId: 'a1', status: 'APPROVED' }),
      verdict({ agentId: 'a2', status: 'APPROVED' }),
      verdict({ agentId: 'a3', status: 'REJECTED' }),
    ]);
    expect(v.status).toBe('APPROVED');
    expect(v.approvedCount).toBe(2);
    expect(v.rejectedCount).toBe(1);
    expect(v.summary).toContain('majority');
  });

  test('majority: a tie with no clear winner escalates', () => {
    const v = councilConsensus([
      verdict({ agentId: 'a1', status: 'APPROVED' }),
      verdict({ agentId: 'a2', status: 'REJECTED' }),
    ]);
    expect(v.status).toBe('ESCALATED');
    expect(v.summary).toContain('No clear consensus');
  });

  test('security veto overrides an approving majority', () => {
    const v = councilConsensus([
      verdict({ agentId: 'a1', status: 'APPROVED' }),
      verdict({ agentId: 'a2', status: 'APPROVED' }),
      verdict({ agentId: 'sec', agentRole: 'security', status: 'REJECTED', securityVeto: true }),
    ]);
    expect(v.status).toBe('REJECTED');
    expect(v.vetoApplied).toBe(true);
    expect(v.vetoByAgentId).toBe('sec');
    expect(v.summary).toContain('Security veto');
  });

  test('compliance veto overrides an approving majority', () => {
    const v = councilConsensus([
      verdict({ agentId: 'a1', status: 'APPROVED' }),
      verdict({ agentId: 'a2', status: 'APPROVED' }),
      verdict({ agentId: 'cmp', agentRole: 'compliance', status: 'REJECTED', complianceVeto: true }),
    ]);
    expect(v.status).toBe('REJECTED');
    expect(v.complianceVetoApplied).toBe(true);
    expect(v.vetoByAgentId).toBe('cmp');
    expect(v.summary).toContain('Compliance veto');
  });

  test('security veto is ignored when allowSecurityVeto is false', () => {
    const config: ConsensusConfig = {
      algorithm: 'majority',
      allowSecurityVeto: false,
      allowComplianceVeto: false,
    };
    const v = councilConsensus(
      [
        verdict({ agentId: 'a1', status: 'APPROVED' }),
        verdict({ agentId: 'a2', status: 'APPROVED' }),
        verdict({ agentId: 'sec', status: 'REJECTED', securityVeto: true }),
      ],
      config,
    );
    expect(v.status).toBe('APPROVED');
    expect(v.vetoApplied).toBe(false);
  });

  test('a single agent below 0.6 confidence escalates', () => {
    const v = councilConsensus([
      verdict({ agentId: 'a1', status: 'APPROVED', confidence: 0.9 }),
      verdict({ agentId: 'a2', status: 'APPROVED', confidence: 0.5 }),
    ]);
    expect(v.status).toBe('ESCALATED');
    expect(v.summary).toContain('confidence');
  });

  test('average confidence below 0.7 escalates even without a single low agent', () => {
    const v = councilConsensus([
      verdict({ agentId: 'a1', status: 'APPROVED', confidence: 0.65 }),
      verdict({ agentId: 'a2', status: 'APPROVED', confidence: 0.65 }),
    ]);
    expect(v.status).toBe('ESCALATED');
    expect(v.averageConfidence).toBeCloseTo(0.65, 5);
  });

  test('unanimous algorithm approves only with zero rejections', () => {
    const config: ConsensusConfig = { algorithm: 'unanimous', allowSecurityVeto: true };
    const approved = councilConsensus(
      [verdict({ agentId: 'a1' }), verdict({ agentId: 'a2' })],
      config,
    );
    expect(approved.status).toBe('APPROVED');
    expect(approved.summary).toContain('unanimously');
  });

  test('unanimous algorithm escalates when any agent rejects', () => {
    const config: ConsensusConfig = { algorithm: 'unanimous', allowSecurityVeto: true };
    const v = councilConsensus(
      [
        verdict({ agentId: 'a1', status: 'APPROVED' }),
        verdict({ agentId: 'a2', status: 'REJECTED' }),
        verdict({ agentId: 'a3', status: 'APPROVED' }),
      ],
      config,
    );
    expect(v.status).toBe('ESCALATED');
  });

  test('aggregates counts and findings across all verdicts', () => {
    const v = councilConsensus([
      verdict({
        agentId: 'a1',
        status: 'APPROVED',
        findings: [{ category: 'style', severity: 'info', message: 'm', agentId: 'a1' }],
      }),
      verdict({ agentId: 'a2', status: 'ABSTAIN' }),
      verdict({ agentId: 'a3', status: 'APPROVED' }),
    ]);
    expect(v.abstainedCount).toBe(1);
    expect(v.approvedCount).toBe(2);
    expect(v.findings).toHaveLength(1);
  });
});
