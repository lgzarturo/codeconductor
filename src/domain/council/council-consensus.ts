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
  readonly complianceVeto?: boolean;
  readonly confidence?: number;
  readonly findings: readonly CouncilFinding[];
  readonly summary: string;
}

/**
 * Consensus algorithm configuration
 */
export interface ConsensusConfig {
  readonly algorithm: 'majority' | 'unanimous';
  readonly allowSecurityVeto: boolean;
  readonly allowComplianceVeto?: boolean;
  /** Roster expected to vote under the unanimous algorithm. Ignored by majority. */
  readonly expectedAgentIds?: readonly string[];
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
  readonly complianceVetoApplied?: boolean;
  readonly vetoByAgentId?: string;
  readonly averageConfidence?: number;
  readonly findings: readonly CouncilFinding[];
  readonly summary: string;
  readonly individualVerdicts: readonly CouncilVerdictInput[];
}

const DEFAULT_CONFIG: ConsensusConfig = {
  algorithm: 'majority',
  allowSecurityVeto: true,
  allowComplianceVeto: true,
};

const VALID_STATUSES: ReadonlySet<string> = new Set(['APPROVED', 'REJECTED', 'ABSTAIN']);

function canonicalAgentId(agentId: string): string {
  return agentId.trim().toLowerCase();
}

/**
 * Reason why unanimity is not reached, or undefined when every required agent
 * approved exactly once.
 */
function unanimousFailure(
  verdicts: readonly CouncilVerdictInput[],
  expectedAgentIds?: readonly string[],
): string | undefined {
  if (expectedAgentIds !== undefined) {
    if (
      expectedAgentIds.length === 0 ||
      expectedAgentIds.some(
        (id) => typeof id !== 'string' || canonicalAgentId(id) === '',
      )
    ) {
      return 'invalid expected agent roster';
    }

    const canonicalExpected = expectedAgentIds.map(canonicalAgentId);
    if (new Set(canonicalExpected).size !== canonicalExpected.length) {
      return 'duplicate agent IDs in expected roster';
    }
  }

  const invalidCount = verdicts.filter(
    (v) =>
      typeof v.agentId !== 'string' ||
      v.agentId.trim() === '' ||
      !VALID_STATUSES.has(v.status),
  ).length;
  if (invalidCount > 0) {
    return `${invalidCount} invalid verdict(s) received`;
  }

  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const v of verdicts) {
    const canonicalId = canonicalAgentId(v.agentId);
    if (seen.has(canonicalId)) {
      duplicates.add(v.agentId);
    }
    seen.add(canonicalId);
  }
  if (duplicates.size > 0) {
    return `duplicate verdicts from ${[...duplicates].join(', ')}`;
  }

  if (expectedAgentIds !== undefined) {
    const missing = expectedAgentIds.filter(
      (id) => !seen.has(canonicalAgentId(id)),
    );
    if (missing.length > 0) {
      return `missing verdicts from ${missing.join(', ')}`;
    }
    const expected = new Set(expectedAgentIds.map(canonicalAgentId));
    const unexpected = verdicts
      .filter((v) => !expected.has(canonicalAgentId(v.agentId)))
      .map((v) => v.agentId);
    if (unexpected.length > 0) {
      return `unexpected verdicts from ${unexpected.join(', ')}`;
    }
  }

  const nonApproving = verdicts.filter((v) => v.status !== 'APPROVED').length;
  if (nonApproving > 0) {
    return `${nonApproving} agent(s) did not approve`;
  }

  return undefined;
}

/**
 * Compute council consensus from N verdicts.
 *
 * Rules:
 *  - Security veto (securityVeto=true + REJECTED) overrides majority → REJECTED
 *  - Compliance veto (complianceVeto=true + REJECTED) overrides majority → REJECTED
 *  - confidence check: if any agent's confidence < 0.6, or average confidence < 0.7 → ESCALATED
 *  - majority: APPROVED if approvedCount > rejectedCount
 *  - unanimous: APPROVED only if every required agent approved exactly once —
 *    missing, duplicate, unexpected, abstaining or invalid verdicts → ESCALATED.
 *    The required set is `config.expectedAgentIds` when provided, otherwise the
 *    distinct agents that submitted a verdict.
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
      complianceVetoApplied: false,
      findings: [],
      summary: 'No verdicts submitted — escalated for human review.',
      individualVerdicts: [],
    };
  }

  let approvedCount = 0;
  let rejectedCount = 0;
  let abstainedCount = 0;
  let vetoApplied = false;
  let complianceVetoApplied = false;
  let vetoByAgentId: string | undefined;
  let totalConfidence = 0;
  let hasLowConfidence = false;
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

    const confidence = typeof v.confidence === 'number' ? v.confidence : 1.0;
    totalConfidence += confidence;
    if (confidence < 0.6) {
      hasLowConfidence = true;
    }

    if (config.allowSecurityVeto && v.securityVeto && v.status === 'REJECTED') {
      vetoApplied = true;
      vetoByAgentId = v.agentId;
    }

    const allowCompliance = typeof config.allowComplianceVeto === 'boolean'
      ? config.allowComplianceVeto
      : true;

    if (allowCompliance && v.complianceVeto && v.status === 'REJECTED') {
      complianceVetoApplied = true;
      vetoByAgentId = v.agentId;
    }

    allFindings.push(...v.findings);
  }

  const averageConfidence = totalConfidence / totalAgents;

  // Security or Compliance veto wins first (override all)
  if (vetoApplied || complianceVetoApplied) {
    const vetoAgent = verdicts.find((v) => v.agentId === vetoByAgentId);
    const vetoType = vetoApplied ? 'Security' : 'Compliance';
    return {
      status: 'REJECTED',
      totalAgents,
      approvedCount,
      rejectedCount,
      abstainedCount,
      vetoApplied,
      complianceVetoApplied,
      vetoByAgentId,
      averageConfidence,
      findings: allFindings,
      summary: `${vetoType} veto applied by ${vetoAgent?.agentRole ?? vetoByAgentId} — rejected regardless of majority.`,
      individualVerdicts: verdicts,
    };
  }

  // Confidence check: Low confidence triggers escalation before standard consensus logic
  if (hasLowConfidence || averageConfidence < 0.7) {
    const reason = hasLowConfidence
      ? 'one or more agents reported confidence below 0.6'
      : `average confidence (${averageConfidence.toFixed(2)}) is below 0.7`;
    return {
      status: 'ESCALATED',
      totalAgents,
      approvedCount,
      rejectedCount,
      abstainedCount,
      vetoApplied: false,
      complianceVetoApplied: false,
      averageConfidence,
      findings: allFindings,
      summary: `Confidence threshold breach: ${reason} — escalated for human review.`,
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
        complianceVetoApplied: false,
        averageConfidence,
        findings: allFindings,
        summary: `Approved by majority (${approvedCount}/${totalAgents}).`,
        individualVerdicts: verdicts,
      };
    }
  }

  // Unanimous check
  if (config.algorithm === 'unanimous') {
    const failure = unanimousFailure(verdicts, config.expectedAgentIds);
    if (!failure) {
      return {
        status: 'APPROVED',
        totalAgents,
        approvedCount,
        rejectedCount,
        abstainedCount,
        vetoApplied: false,
        complianceVetoApplied: false,
        averageConfidence,
        findings: allFindings,
        summary: `Approved unanimously (${approvedCount}/${totalAgents}).`,
        individualVerdicts: verdicts,
      };
    }

    return {
      status: 'ESCALATED',
      totalAgents,
      approvedCount,
      rejectedCount,
      abstainedCount,
      vetoApplied: false,
      complianceVetoApplied: false,
      averageConfidence,
      findings: allFindings,
      summary: `Unanimity not reached: ${failure} — escalated for human review.`,
      individualVerdicts: verdicts,
    };
  }

  // No clear majority or rejection → ESCALATED
  return {
    status: 'ESCALATED',
    totalAgents,
    approvedCount,
    rejectedCount,
    abstainedCount,
    vetoApplied: false,
    complianceVetoApplied: false,
    averageConfidence,
    findings: allFindings,
    summary: `No clear consensus (${approvedCount} approved, ${rejectedCount} rejected, ${abstainedCount} abstained) — escalated for human review.`,
    individualVerdicts: verdicts,
  };
}
