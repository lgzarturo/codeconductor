/**
 * Council finding — a single review observation
 */
export interface CouncilFinding {
  readonly category: string;
  readonly severity: 'info' | 'warning' | 'critical';
  readonly message: string;
  readonly agentId: string;
}

/**
 * Verdict input from a single reviewer agent
 */
export interface CouncilVerdictInput {
  readonly agentId: string;
  readonly agentRole: string;
  readonly status: 'APPROVED' | 'REJECTED' | 'ABSTAIN';
  readonly securityVeto: boolean;
  readonly findings: readonly CouncilFinding[];
  readonly summary: string;
}

/**
 * Consensus algorithm configuration
 */
export interface ConsensusConfig {
  readonly algorithm: 'majority' | 'unanimous';
  readonly allowSecurityVeto: boolean;
}

/**
 * Final council verdict — the output of the consensus engine
 */
export interface CouncilVerdict {
  readonly status: 'APPROVED' | 'REJECTED' | 'ESCALATED';
  readonly totalAgents: number;
  readonly approvedCount: number;
  readonly rejectedCount: number;
  readonly abstainedCount: number;
  readonly vetoApplied: boolean;
  readonly vetoByAgentId?: string;
  readonly findings: readonly CouncilFinding[];
  readonly summary: string;
  readonly individualVerdicts: readonly CouncilVerdictInput[];
}

const DEFAULT_CONFIG: ConsensusConfig = {
  algorithm: 'majority',
  allowSecurityVeto: true,
};

/**
 * Compute council consensus from N verdicts.
 *
 * Rules:
 *  - Security veto (securityVeto=true + REJECTED) overrides majority → REJECTED
 *  - majority: APPROVED if approvedCount > rejectedCount
 *  - unanimous: APPROVED only if rejectedCount === 0
 *  - No majority and no veto → ESCALATED
 *  - Empty input → ESCALATED
 */
export function councilConsensus(
  verdicts: readonly CouncilVerdictInput[],
  config: ConsensusConfig = DEFAULT_CONFIG,
): CouncilVerdict {
  const totalAgents = verdicts.length;

  // Empty input → ESCALATED
  if (totalAgents === 0) {
    return {
      status: 'ESCALATED',
      totalAgents: 0,
      approvedCount: 0,
      rejectedCount: 0,
      abstainedCount: 0,
      vetoApplied: false,
      findings: [],
      summary: 'No verdicts submitted — escalated for human review.',
      individualVerdicts: [],
    };
  }

  let approvedCount = 0;
  let rejectedCount = 0;
  let abstainedCount = 0;
  let vetoApplied = false;
  let vetoByAgentId: string | undefined;
  const allFindings: CouncilFinding[] = [];

  for (const v of verdicts) {
    switch (v.status) {
      case 'APPROVED':
        approvedCount++;
        break;
      case 'REJECTED':
        rejectedCount++;
        break;
      case 'ABSTAIN':
        abstainedCount++;
        break;
    }

    if (config.allowSecurityVeto && v.securityVeto && v.status === 'REJECTED') {
      vetoApplied = true;
      vetoByAgentId = v.agentId;
    }

    allFindings.push(...v.findings);
  }

  // Security veto wins
  if (vetoApplied) {
    const vetoAgent = verdicts.find((v) => v.agentId === vetoByAgentId);
    return {
      status: 'REJECTED',
      totalAgents,
      approvedCount,
      rejectedCount,
      abstainedCount,
      vetoApplied: true,
      vetoByAgentId,
      findings: allFindings,
      summary: `Security veto applied by ${vetoAgent?.agentRole ?? vetoByAgentId} — rejected regardless of majority.`,
      individualVerdicts: verdicts,
    };
  }

  // Majority check
  if (config.algorithm === 'majority') {
    if (approvedCount > rejectedCount) {
      return {
        status: 'APPROVED',
        totalAgents,
        approvedCount,
        rejectedCount,
        abstainedCount,
        vetoApplied: false,
        findings: allFindings,
        summary: `Approved by majority (${approvedCount}/${totalAgents}).`,
        individualVerdicts: verdicts,
      };
    }
  }

  // Unanimous check
  if (config.algorithm === 'unanimous') {
    if (rejectedCount === 0) {
      return {
        status: 'APPROVED',
        totalAgents,
        approvedCount,
        rejectedCount,
        abstainedCount,
        vetoApplied: false,
        findings: allFindings,
        summary: `Approved unanimously (${approvedCount}/${totalAgents}).`,
        individualVerdicts: verdicts,
      };
    }
  }

  // No clear majority or rejection → ESCALATED
  return {
    status: 'ESCALATED',
    totalAgents,
    approvedCount,
    rejectedCount,
    abstainedCount,
    vetoApplied: false,
    findings: allFindings,
    summary: `No clear consensus (${approvedCount} approved, ${rejectedCount} rejected, ${abstainedCount} abstained) — escalated for human review.`,
    individualVerdicts: verdicts,
  };
}
