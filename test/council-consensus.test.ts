import { describe, expect, test } from 'bun:test';
import {
  councilConsensus,
  type CouncilVerdictInput,
  type ConsensusConfig,
} from '../src/domain/council/council-consensus';

function makeVerdict(
  agentId: string,
  status: 'APPROVED' | 'REJECTED' | 'ABSTAIN',
  securityVeto = false,
): CouncilVerdictInput {
  return {
    agentId,
    agentRole: agentId.charAt(0).toUpperCase() + agentId.slice(1),
    status,
    securityVeto,
    findings: [],
    summary: `${agentId} voted ${status}.`,
  };
}

function makeVetoVerdict(agentId: string): CouncilVerdictInput {
  return {
    agentId,
    agentRole: agentId.charAt(0).toUpperCase() + agentId.slice(1),
    status: 'REJECTED',
    securityVeto: true,
    findings: [
      {
        category: 'security',
        severity: 'critical',
        message: 'Critical vulnerability detected',
        agentId,
      },
    ],
    summary: `${agentId} applied security veto.`,
  };
}

const MAJORITY_CONFIG: ConsensusConfig = { algorithm: 'majority', allowSecurityVeto: true };
const UNANIMOUS_CONFIG: ConsensusConfig = { algorithm: 'unanimous', allowSecurityVeto: true };
const NO_VETO_CONFIG: ConsensusConfig = { algorithm: 'majority', allowSecurityVeto: false };

// ─── Majority Algorithm ────────────────────────────────────────────────────────

describe('councilConsensus — majority algorithm', () => {
  test('APPROVED when 2/3 approve and 1 rejects', () => {
    const verdicts = [
      makeVerdict('architect', 'APPROVED'),
      makeVerdict('security', 'APPROVED'),
      makeVerdict('devil', 'REJECTED'),
    ];
    const result = councilConsensus(verdicts, MAJORITY_CONFIG);
    expect(result.status).toBe('APPROVED');
    expect(result.approvedCount).toBe(2);
    expect(result.rejectedCount).toBe(1);
    expect(result.totalAgents).toBe(3);
    expect(result.vetoApplied).toBe(false);
  });

  test('REJECTED when 2/3 reject and 1 approves', () => {
    const verdicts = [
      makeVerdict('architect', 'APPROVED'),
      makeVerdict('security', 'REJECTED'),
      makeVerdict('devil', 'REJECTED'),
    ];
    const result = councilConsensus(verdicts, MAJORITY_CONFIG);
    expect(result.status).toBe('ESCALATED');
    expect(result.approvedCount).toBe(1);
    expect(result.rejectedCount).toBe(2);
  });

  test('APPROVED with abstentions counting toward quorum', () => {
    const verdicts = [
      makeVerdict('architect', 'APPROVED'),
      makeVerdict('security', 'ABSTAIN'),
      makeVerdict('devil', 'ABSTAIN'),
    ];
    const result = councilConsensus(verdicts, MAJORITY_CONFIG);
    expect(result.status).toBe('APPROVED');
    expect(result.approvedCount).toBe(1);
    expect(result.abstainedCount).toBe(2);
  });
});

// ─── Security Veto ─────────────────────────────────────────────────────────────

describe('councilConsensus — security veto override', () => {
  test('3 reviewers: 2 approve + 1 security-veto → REJECTED', () => {
    const verdicts = [
      makeVerdict('architect', 'APPROVED'),
      makeVerdict('product', 'APPROVED'),
      makeVetoVerdict('security'),
    ];
    const result = councilConsensus(verdicts, MAJORITY_CONFIG);
    expect(result.status).toBe('REJECTED');
    expect(result.vetoApplied).toBe(true);
    expect(result.vetoByAgentId).toBe('security');
    expect(result.approvedCount).toBe(2);
    expect(result.rejectedCount).toBe(1);
  });

  test('veto ignored when allowSecurityVeto is false', () => {
    const verdicts = [
      makeVerdict('architect', 'APPROVED'),
      makeVerdict('product', 'APPROVED'),
      makeVetoVerdict('security'),
    ];
    const result = councilConsensus(verdicts, NO_VETO_CONFIG);
    expect(result.status).toBe('APPROVED');
    expect(result.vetoApplied).toBe(false);
  });

  test('veto only applies when status is REJECTED', () => {
    const verdicts: CouncilVerdictInput[] = [
      makeVerdict('architect', 'APPROVED'),
      {
        agentId: 'security',
        agentRole: 'Security',
        status: 'APPROVED',
        securityVeto: true,
        findings: [],
        summary: 'Approved despite veto flag.',
      },
    ];
    const result = councilConsensus(verdicts, MAJORITY_CONFIG);
    expect(result.status).toBe('APPROVED');
    expect(result.vetoApplied).toBe(false);
  });
});

// ─── Unanimous Algorithm ───────────────────────────────────────────────────────

describe('councilConsensus — unanimous algorithm', () => {
  test('APPROVED when all approve', () => {
    const verdicts = [
      makeVerdict('architect', 'APPROVED'),
      makeVerdict('security', 'APPROVED'),
      makeVerdict('devil', 'APPROVED'),
    ];
    const result = councilConsensus(verdicts, UNANIMOUS_CONFIG);
    expect(result.status).toBe('APPROVED');
  });

  test('REJECTED when one rejects (not unanimous)', () => {
    const verdicts = [
      makeVerdict('architect', 'APPROVED'),
      makeVerdict('security', 'APPROVED'),
      makeVerdict('devil', 'REJECTED'),
    ];
    const result = councilConsensus(verdicts, UNANIMOUS_CONFIG);
    expect(result.status).toBe('ESCALATED');
  });

  test('veto overrides unanimous', () => {
    const verdicts = [
      makeVerdict('architect', 'APPROVED'),
      makeVetoVerdict('security'),
      makeVerdict('devil', 'APPROVED'),
    ];
    const result = councilConsensus(verdicts, UNANIMOUS_CONFIG);
    expect(result.status).toBe('REJECTED');
    expect(result.vetoApplied).toBe(true);
  });
});

// ─── Edge Cases ────────────────────────────────────────────────────────────────

describe('councilConsensus — edge cases', () => {
  test('empty input → ESCALATED', () => {
    const result = councilConsensus([], MAJORITY_CONFIG);
    expect(result.status).toBe('ESCALATED');
    expect(result.totalAgents).toBe(0);
    expect(result.summary).toContain('No verdicts submitted');
  });

  test('single APPROVED → APPROVED', () => {
    const verdicts = [makeVerdict('architect', 'APPROVED')];
    const result = councilConsensus(verdicts, MAJORITY_CONFIG);
    expect(result.status).toBe('APPROVED');
  });

  test('single REJECTED → ESCALATED', () => {
    const verdicts = [makeVerdict('architect', 'REJECTED')];
    const result = councilConsensus(verdicts, MAJORITY_CONFIG);
    expect(result.status).toBe('ESCALATED');
  });

  test('all ABSTAIN → ESCALATED', () => {
    const verdicts = [
      makeVerdict('architect', 'ABSTAIN'),
      makeVerdict('security', 'ABSTAIN'),
    ];
    const result = councilConsensus(verdicts, MAJORITY_CONFIG);
    expect(result.status).toBe('ESCALATED');
  });

  test('findings are aggregated across all verdicts', () => {
    const verdicts: CouncilVerdictInput[] = [
      {
        agentId: 'architect',
        agentRole: 'Architect',
        status: 'APPROVED',
        securityVeto: false,
        findings: [
          { category: 'architecture', severity: 'warning', message: 'Consider DI', agentId: 'architect' },
        ],
        summary: 'Approved with notes.',
      },
      {
        agentId: 'security',
        agentRole: 'Security',
        status: 'APPROVED',
        securityVeto: false,
        findings: [
          { category: 'security', severity: 'info', message: 'Use HTTPS', agentId: 'security' },
        ],
        summary: 'Approved.',
      },
    ];
    const result = councilConsensus(verdicts, MAJORITY_CONFIG);
    expect(result.findings).toHaveLength(2);
    expect(result.findings[0]!.category).toBe('architecture');
    expect(result.findings[1]!.category).toBe('security');
  });

  test('default config is majority with veto enabled', () => {
    const verdicts = [
      makeVerdict('architect', 'APPROVED'),
      makeVerdict('product', 'APPROVED'),
      makeVerdict('devil', 'REJECTED'),
    ];
    const result = councilConsensus(verdicts);
    expect(result.status).toBe('APPROVED');
  });
});

// ─── Tie case ─────────────────────────────────────────────────────────────────

describe('councilConsensus — majority tie', () => {
  test('1 approve + 1 reject → ESCALATED (no majority)', () => {
    const verdicts = [
      makeVerdict('architect', 'APPROVED'),
      makeVerdict('security', 'REJECTED'),
    ];
    const result = councilConsensus(verdicts, MAJORITY_CONFIG);
    expect(result.status).toBe('ESCALATED');
    expect(result.approvedCount).toBe(1);
    expect(result.rejectedCount).toBe(1);
    expect(result.abstainedCount).toBe(0);
  });

  test('2 approve + 2 reject → ESCALATED (no majority)', () => {
    const verdicts = [
      makeVerdict('architect', 'APPROVED'),
      makeVerdict('product', 'APPROVED'),
      makeVerdict('security', 'REJECTED'),
      makeVerdict('devil', 'REJECTED'),
    ];
    const result = councilConsensus(verdicts, MAJORITY_CONFIG);
    expect(result.status).toBe('ESCALATED');
  });

  test('2 approve + 1 reject + 1 abstain → APPROVED (majority with abstention)', () => {
    const verdicts = [
      makeVerdict('architect', 'APPROVED'),
      makeVerdict('product', 'APPROVED'),
      makeVerdict('devil', 'REJECTED'),
      makeVerdict('delivery', 'ABSTAIN'),
    ];
    const result = councilConsensus(verdicts, MAJORITY_CONFIG);
    expect(result.status).toBe('APPROVED');
    expect(result.abstainedCount).toBe(1);
  });
});

// ─── Multiple security vetos ───────────────────────────────────────────────────

describe('councilConsensus — multiple security vetos', () => {
  test('two REJECTED verdicts with securityVeto → REJECTED, last one wins as vetoByAgentId', () => {
    const verdicts: CouncilVerdictInput[] = [
      makeVetoVerdict('security-a'),
      makeVetoVerdict('security-b'),
    ];
    const result = councilConsensus(verdicts, MAJORITY_CONFIG);
    expect(result.status).toBe('REJECTED');
    expect(result.vetoApplied).toBe(true);
    // The last veto encountered wins because the loop overwrites vetoByAgentId
    expect(result.vetoByAgentId).toBe('security-b');
  });

  test('securityVeto:false + securityVeto:true + REJECTED → only the true one counts', () => {
    const verdicts: CouncilVerdictInput[] = [
      {
        agentId: 'false-flag',
        agentRole: 'FalseFlag',
        status: 'REJECTED',
        securityVeto: false,
        findings: [],
        summary: 'rejected without veto',
      },
      makeVetoVerdict('real-security'),
    ];
    const result = councilConsensus(verdicts, MAJORITY_CONFIG);
    expect(result.status).toBe('REJECTED');
    expect(result.vetoByAgentId).toBe('real-security');
  });
});

// ─── Large N reviewers (N=5+) ──────────────────────────────────────────────────

describe('councilConsensus — large reviewer count (N=5)', () => {
  test('5 reviewers: 4 approve + 1 reject → APPROVED', () => {
    const verdicts = [
      makeVerdict('architect', 'APPROVED'),
      makeVerdict('security', 'APPROVED'),
      makeVerdict('product', 'APPROVED'),
      makeVerdict('delivery', 'APPROVED'),
      makeVerdict('devil', 'REJECTED'),
    ];
    const result = councilConsensus(verdicts, MAJORITY_CONFIG);
    expect(result.status).toBe('APPROVED');
    expect(result.totalAgents).toBe(5);
    expect(result.approvedCount).toBe(4);
    expect(result.rejectedCount).toBe(1);
  });

  test('5 reviewers: 3 approve + 2 reject → APPROVED (strict majority)', () => {
    const verdicts = [
      makeVerdict('architect', 'APPROVED'),
      makeVerdict('security', 'APPROVED'),
      makeVerdict('product', 'APPROVED'),
      makeVerdict('delivery', 'REJECTED'),
      makeVerdict('devil', 'REJECTED'),
    ];
    const result = councilConsensus(verdicts, MAJORITY_CONFIG);
    expect(result.status).toBe('APPROVED');
    expect(result.totalAgents).toBe(5);
  });

  test('5 reviewers: 1 security veto + 4 approve → REJECTED', () => {
    const verdicts = [
      makeVerdict('architect', 'APPROVED'),
      makeVerdict('product', 'APPROVED'),
      makeVerdict('delivery', 'APPROVED'),
      makeVerdict('data-ops', 'APPROVED'),
      makeVetoVerdict('security'),
    ];
    const result = councilConsensus(verdicts, MAJORITY_CONFIG);
    expect(result.status).toBe('REJECTED');
    expect(result.vetoByAgentId).toBe('security');
    expect(result.vetoApplied).toBe(true);
  });
});

// ─── Unanimous edge cases ─────────────────────────────────────────────────────

describe('councilConsensus — unanimous edge cases', () => {
  test('all ABSTAIN → ESCALATED (unanimity requires explicit approval)', () => {
    const verdicts = [
      makeVerdict('architect', 'ABSTAIN'),
      makeVerdict('security', 'ABSTAIN'),
      makeVerdict('product', 'ABSTAIN'),
    ];
    const result = councilConsensus(verdicts, UNANIMOUS_CONFIG);
    expect(result.status).toBe('ESCALATED');
    expect(result.approvedCount).toBe(0);
    expect(result.rejectedCount).toBe(0);
    expect(result.abstainedCount).toBe(3);
  });

  test('unanimous: 1 abstain + 1 reject → ESCALATED', () => {
    const verdicts = [
      makeVerdict('architect', 'ABSTAIN'),
      makeVerdict('security', 'REJECTED'),
    ];
    const result = councilConsensus(verdicts, UNANIMOUS_CONFIG);
    expect(result.status).toBe('ESCALATED');
  });

  test('unanimous: 1 approve + 1 abstain → ESCALATED', () => {
    const verdicts = [
      makeVerdict('architect', 'APPROVED'),
      makeVerdict('security', 'ABSTAIN'),
    ];
    const result = councilConsensus(verdicts, UNANIMOUS_CONFIG);
    expect(result.status).toBe('ESCALATED');
  });

  test('unanimous: duplicate verdict from the same agent → ESCALATED', () => {
    const verdicts = [
      makeVerdict('architect', 'APPROVED'),
      makeVerdict('architect', 'APPROVED'),
    ];
    const result = councilConsensus(verdicts, UNANIMOUS_CONFIG);
    expect(result.status).toBe('ESCALATED');
    expect(result.totalAgents).toBe(2);
  });
});

// ─── Unanimous with expected roster ───────────────────────────────────────────

describe('councilConsensus — unanimous with expectedAgentIds', () => {
  const ROSTER_CONFIG: ConsensusConfig = {
    algorithm: 'unanimous',
    allowSecurityVeto: true,
    expectedAgentIds: ['architect', 'security', 'product'],
  };

  test('every expected agent approves exactly once → APPROVED', () => {
    const verdicts = [
      makeVerdict('architect', 'APPROVED'),
      makeVerdict('security', 'APPROVED'),
      makeVerdict('product', 'APPROVED'),
    ];
    const result = councilConsensus(verdicts, ROSTER_CONFIG);
    expect(result.status).toBe('APPROVED');
    expect(result.totalAgents).toBe(3);
  });

  test('silent agent (missing verdict) → ESCALATED', () => {
    const verdicts = [
      makeVerdict('architect', 'APPROVED'),
      makeVerdict('security', 'APPROVED'),
    ];
    const result = councilConsensus(verdicts, ROSTER_CONFIG);
    expect(result.status).toBe('ESCALATED');
    expect(result.summary).toContain('product');
  });

  test('unexpected agent → ESCALATED', () => {
    const verdicts = [
      makeVerdict('architect', 'APPROVED'),
      makeVerdict('security', 'APPROVED'),
      makeVerdict('product', 'APPROVED'),
      makeVerdict('devil', 'APPROVED'),
    ];
    const result = councilConsensus(verdicts, ROSTER_CONFIG);
    expect(result.status).toBe('ESCALATED');
    expect(result.summary).toContain('devil');
  });

  test('security veto with an incomplete roster still → REJECTED', () => {
    const verdicts = [makeVetoVerdict('security')];
    const result = councilConsensus(verdicts, ROSTER_CONFIG);
    expect(result.status).toBe('REJECTED');
    expect(result.vetoApplied).toBe(true);
  });
});

// ─── JSON serialization round-trip ────────────────────────────────────────────

describe('councilConsensus — JSON serialization round-trip', () => {
  test('verdicts survive JSON.stringify → JSON.parse and produce the same result', () => {
    const verdicts: CouncilVerdictInput[] = [
      makeVetoVerdict('security'),
      makeVerdict('architect', 'APPROVED'),
      makeVerdict('product', 'APPROVED'),
    ];
    const config: ConsensusConfig = { algorithm: 'majority', allowSecurityVeto: true };

    const before = councilConsensus(verdicts, config);

    const json = JSON.stringify(verdicts);
    const restored: CouncilVerdictInput[] = JSON.parse(json);
    const after = councilConsensus(restored, config);

    expect(after.status).toBe(before.status);
    expect(after.approvedCount).toBe(before.approvedCount);
    expect(after.rejectedCount).toBe(before.rejectedCount);
    expect(after.abstainedCount).toBe(before.abstainedCount);
    expect(after.vetoApplied).toBe(before.vetoApplied);
    expect(after.vetoByAgentId).toBe(before.vetoByAgentId);
    expect(after.findings.length).toBe(before.findings.length);
  });
});

// ─── Output structure correctness ─────────────────────────────────────────────

describe('councilConsensus — output structure', () => {
  test('individualVerdicts preserves all input verdicts in order', () => {
    const verdicts = [
      makeVerdict('architect', 'APPROVED'),
      makeVerdict('security', 'APPROVED'),
      makeVetoVerdict('devil'),
    ];
    const result = councilConsensus(verdicts, MAJORITY_CONFIG);
    expect(result.individualVerdicts).toHaveLength(3);
    expect(result.individualVerdicts[0]!.agentId).toBe('architect');
    expect(result.individualVerdicts[1]!.agentId).toBe('security');
    expect(result.individualVerdicts[2]!.agentId).toBe('devil');
  });

  test('all required fields are present in the verdict output', () => {
    const verdicts = [makeVerdict('architect', 'APPROVED')];
    const result = councilConsensus(verdicts, MAJORITY_CONFIG);
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('totalAgents');
    expect(result).toHaveProperty('approvedCount');
    expect(result).toHaveProperty('rejectedCount');
    expect(result).toHaveProperty('abstainedCount');
    expect(result).toHaveProperty('vetoApplied');
    expect(result).toHaveProperty('findings');
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('individualVerdicts');
  });
});

// ─── security-reviewer sub-agent ─────────────────────────────────────────────

describe('councilConsensus — security-reviewer sub-agent', () => {
  test('security-reviewer veto overrides majority (4 approve + 1 security-reviewer veto)', () => {
    const verdicts = [
      makeVerdict('architect', 'APPROVED'),
      makeVerdict('security', 'APPROVED'),
      makeVerdict('product', 'APPROVED'),
      makeVerdict('delivery', 'APPROVED'),
      makeVetoVerdict('security-reviewer'),
    ];
    const result = councilConsensus(verdicts, MAJORITY_CONFIG);
    expect(result.status).toBe('REJECTED');
    expect(result.vetoApplied).toBe(true);
    expect(result.vetoByAgentId).toBe('security-reviewer');
  });

  test('security-reviewer APPROVED does not veto', () => {
    const verdicts = [
      makeVerdict('architect', 'APPROVED'),
      makeVerdict('security-reviewer', 'APPROVED'),
      makeVerdict('devil', 'REJECTED'),
    ];
    const result = councilConsensus(verdicts, MAJORITY_CONFIG);
    expect(result.status).toBe('APPROVED');
    expect(result.vetoApplied).toBe(false);
  });

  test('security-reviewer ABSTAIN does not count as rejection', () => {
    const verdicts = [
      makeVerdict('architect', 'APPROVED'),
      makeVerdict('security-reviewer', 'ABSTAIN'),
      makeVerdict('devil', 'APPROVED'),
    ];
    const result = councilConsensus(verdicts, MAJORITY_CONFIG);
    expect(result.status).toBe('APPROVED');
    expect(result.vetoApplied).toBe(false);
  });

  test('security-reviewer coexists with existing security agent (both veto → last wins)', () => {
    const verdicts = [
      makeVetoVerdict('security'),
      makeVetoVerdict('security-reviewer'),
    ];
    const result = councilConsensus(verdicts, MAJORITY_CONFIG);
    expect(result.status).toBe('REJECTED');
    expect(result.vetoApplied).toBe(true);
    expect(result.vetoByAgentId).toBe('security-reviewer');
  });

  test('backward compatibility: existing security agent still works', () => {
    const verdicts = [
      makeVerdict('architect', 'APPROVED'),
      makeVerdict('product', 'APPROVED'),
      makeVetoVerdict('security'),
    ];
    const result = councilConsensus(verdicts, MAJORITY_CONFIG);
    expect(result.status).toBe('REJECTED');
    expect(result.vetoApplied).toBe(true);
    expect(result.vetoByAgentId).toBe('security');
  });

  test('backward compatibility: existing council agents still produce correct results', () => {
    const verdicts = [
      makeVerdict('architect', 'APPROVED'),
      makeVerdict('security', 'APPROVED'),
      makeVerdict('product', 'APPROVED'),
      makeVerdict('delivery', 'APPROVED'),
      makeVerdict('data-ops', 'APPROVED'),
      makeVerdict('devil', 'REJECTED'),
    ];
    const result = councilConsensus(verdicts, MAJORITY_CONFIG);
    expect(result.status).toBe('APPROVED');
    expect(result.totalAgents).toBe(6);
    expect(result.approvedCount).toBe(5);
    expect(result.rejectedCount).toBe(1);
  });
});
