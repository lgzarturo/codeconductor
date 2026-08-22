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

  test('unanimous algorithm never approves without an expected roster', () => {
    // Unanimity over "whoever happened to answer" is not unanimity: a silenced
    // agent would otherwise be indistinguishable from an approving one.
    const config: ConsensusConfig = { algorithm: 'unanimous', allowSecurityVeto: true };
    const v = councilConsensus(
      [verdict({ agentId: 'a1' }), verdict({ agentId: 'a2' })],
      config,
    );
    expect(v.status).toBe('ESCALATED');
    expect(v.summary).toContain('roster');
  });

  test('majority algorithm approves without an expected roster', () => {
    const v = councilConsensus(
      [verdict({ agentId: 'a1' }), verdict({ agentId: 'a2' })],
      { algorithm: 'majority', allowSecurityVeto: true },
    );
    expect(v.status).toBe('APPROVED');
  });

  test('majority algorithm ignores a malformed expected roster', () => {
    const v = councilConsensus(
      [verdict({ agentId: 'a1' }), verdict({ agentId: 'a2' })],
      { algorithm: 'majority', allowSecurityVeto: true, expectedAgentIds: [] },
    );
    expect(v.status).toBe('APPROVED');
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

  test('unanimous algorithm escalates when any agent abstains', () => {
    const config: ConsensusConfig = { algorithm: 'unanimous', allowSecurityVeto: true };
    const v = councilConsensus(
      [verdict({ agentId: 'a1', status: 'APPROVED' }), verdict({ agentId: 'a2', status: 'ABSTAIN' })],
      config,
    );
    expect(v.status).toBe('ESCALATED');
  });

  test('unanimous algorithm escalates when the same agent votes twice', () => {
    const config: ConsensusConfig = { algorithm: 'unanimous', allowSecurityVeto: true };
    const v = councilConsensus(
      [verdict({ agentId: 'a1', status: 'APPROVED' }), verdict({ agentId: 'a1', status: 'APPROVED' })],
      config,
    );
    expect(v.status).toBe('ESCALATED');
    expect(v.summary).toContain('duplicate');
  });

  for (const alias of ['architect ', 'Architect']) {
    test(`unanimous algorithm treats "${alias}" as a duplicate of "architect" without a roster`, () => {
      const config: ConsensusConfig = { algorithm: 'unanimous', allowSecurityVeto: true };
      const v = councilConsensus(
        [
          verdict({ agentId: 'architect', status: 'APPROVED' }),
          verdict({ agentId: alias, status: 'APPROVED' }),
        ],
        config,
      );
      expect(v.status).toBe('ESCALATED');
      expect(v.summary).toContain('duplicate');
    });
  }

  test('unanimous algorithm escalates when an agentId is blank', () => {
    const config: ConsensusConfig = { algorithm: 'unanimous', allowSecurityVeto: true };
    const v = councilConsensus(
      [verdict({ agentId: '', status: 'APPROVED' }), verdict({ agentId: 'a2', status: 'APPROVED' })],
      config,
    );
    expect(v.status).toBe('ESCALATED');
    expect(v.summary).toContain('invalid');
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

describe('domain/council/council-consensus — unanimous with expected roster', () => {
  const roster = (expectedAgentIds: readonly string[]): ConsensusConfig => ({
    algorithm: 'unanimous',
    allowSecurityVeto: true,
    allowComplianceVeto: true,
    expectedAgentIds,
  });

  test('approves when every expected agent approves exactly once', () => {
    const v = councilConsensus(
      [
        verdict({ agentId: 'a1', status: 'APPROVED' }),
        verdict({ agentId: 'a2', status: 'APPROVED' }),
      ],
      roster(['a1', 'a2']),
    );
    expect(v.status).toBe('APPROVED');
    expect(v.totalAgents).toBe(2);
    expect(v.summary).toContain('unanimously');
  });

  for (const duplicateRoster of [
    ['architect', 'architect'],
    ['architect', 'architect '],
    ['architect', 'Architect'],
  ]) {
    test(`escalates when roster contains duplicate agent aliases: ${duplicateRoster.join(', ')}`, () => {
      const v = councilConsensus(
        [verdict({ agentId: 'architect', status: 'APPROVED' })],
        roster(duplicateRoster),
      );
      expect(v.status).toBe('ESCALATED');
      expect(v.summary).toContain('duplicate');
    });
  }

  test('escalates when unanimous engine receives an empty expected roster', () => {
    const v = councilConsensus(
      [verdict({ agentId: 'architect', status: 'APPROVED' })],
      roster([]),
    );
    expect(v.status).toBe('ESCALATED');
    expect(v.summary).toContain('invalid');
  });

  test('escalates when an expected agent is missing', () => {
    const v = councilConsensus(
      [verdict({ agentId: 'a1', status: 'APPROVED' })],
      roster(['a1', 'a2']),
    );
    expect(v.status).toBe('ESCALATED');
    expect(v.summary).toContain('missing');
    expect(v.summary).toContain('a2');
    expect(v.totalAgents).toBe(1);
  });

  test('escalates when an expected agent votes twice', () => {
    const v = councilConsensus(
      [
        verdict({ agentId: 'a1', status: 'APPROVED' }),
        verdict({ agentId: 'a1', status: 'APPROVED' }),
        verdict({ agentId: 'a2', status: 'APPROVED' }),
      ],
      roster(['a1', 'a2']),
    );
    expect(v.status).toBe('ESCALATED');
    expect(v.summary).toContain('duplicate');
    expect(v.totalAgents).toBe(3);
  });

  test('escalates when an unexpected agent submits a verdict', () => {
    const v = councilConsensus(
      [
        verdict({ agentId: 'a1', status: 'APPROVED' }),
        verdict({ agentId: 'a2', status: 'APPROVED' }),
        verdict({ agentId: 'intruder', status: 'APPROVED' }),
      ],
      roster(['a1', 'a2']),
    );
    expect(v.status).toBe('ESCALATED');
    expect(v.summary).toContain('unexpected');
    expect(v.summary).toContain('intruder');
  });

  test('escalates when no verdicts are received for a non-empty roster', () => {
    const v = councilConsensus([], roster(['a1', 'a2']));
    expect(v.status).toBe('ESCALATED');
    expect(v.totalAgents).toBe(0);
  });

  test('escalates when an expected agent abstains', () => {
    const v = councilConsensus(
      [
        verdict({ agentId: 'a1', status: 'APPROVED' }),
        verdict({ agentId: 'a2', status: 'ABSTAIN' }),
      ],
      roster(['a1', 'a2']),
    );
    expect(v.status).toBe('ESCALATED');
    expect(v.abstainedCount).toBe(1);
  });

  test('escalates when a verdict carries an invalid status', () => {
    const invalid = {
      ...verdict({ agentId: 'a2' }),
      status: 'MAYBE',
    } as unknown as CouncilVerdictInput;
    const v = councilConsensus(
      [verdict({ agentId: 'a1', status: 'APPROVED' }), invalid],
      roster(['a1', 'a2']),
    );
    expect(v.status).toBe('ESCALATED');
    expect(v.summary).toContain('invalid');
  });

  test('security veto still rejects even when the roster is incomplete', () => {
    const v = councilConsensus(
      [verdict({ agentId: 'sec', agentRole: 'security', status: 'REJECTED', securityVeto: true })],
      roster(['a1', 'a2', 'sec']),
    );
    expect(v.status).toBe('REJECTED');
    expect(v.vetoApplied).toBe(true);
    expect(v.vetoByAgentId).toBe('sec');
  });

  test('compliance veto still rejects even when the roster is incomplete', () => {
    const v = councilConsensus(
      [verdict({ agentId: 'cmp', agentRole: 'compliance', status: 'REJECTED', complianceVeto: true })],
      roster(['a1', 'cmp']),
    );
    expect(v.status).toBe('REJECTED');
    expect(v.complianceVetoApplied).toBe(true);
  });

  test('roster is ignored by the majority algorithm', () => {
    const v = councilConsensus(
      [
        verdict({ agentId: 'a1', status: 'APPROVED' }),
        verdict({ agentId: 'a2', status: 'APPROVED' }),
      ],
      { algorithm: 'majority', allowSecurityVeto: true, expectedAgentIds: ['a1', 'a2', 'a3'] },
    );
    expect(v.status).toBe('APPROVED');
    expect(v.summary).toContain('majority');
  });
});
