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

export type CriticalFindingsPolicy = 'escalate' | 'reject' | 'ignore';

/**
 * Consensus algorithm configuration
 */
export interface ConsensusConfig {
  readonly algorithm: 'majority' | 'unanimous';
  readonly allowSecurityVeto: boolean;
  readonly allowComplianceVeto?: boolean;
  /**
   * Roster expected to vote. Required for unanimous approval; used for
   * quorum defaults under majority.
   */
  readonly expectedAgentIds?: readonly string[];
  /** Minimum ballots required. See resolveQuorum(). */
  readonly quorum?: number;
  /** What to do with severity:critical findings after explicit vetos. */
  readonly criticalFindingsPolicy?: CriticalFindingsPolicy;
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
  criticalFindingsPolicy: 'escalate',
};

const VALID_STATUSES: ReadonlySet<string> = new Set(['APPROVED', 'REJECTED', 'ABSTAIN']);

const SECURITY_CATEGORIES = new Set([
  'security',
  'auth',
  'injection',
  'credentials',
  'supply-chain',
]);

function canonicalAgentId(agentId: string): string {
  return agentId.trim().toLowerCase();
}

function isSecurityCategory(category: string): boolean {
  return SECURITY_CATEGORIES.has(category.trim().toLowerCase());
}

export function resolveQuorum(
  config: ConsensusConfig,
  ballotCount: number,
): { readonly required: number; readonly met: boolean } {
  if (typeof config.quorum === 'number') {
    const required = Math.max(1, config.quorum);
    return { required, met: ballotCount >= required };
  }
  if (config.expectedAgentIds && config.expectedAgentIds.length > 0) {
    const required = Math.ceil(config.expectedAgentIds.length / 2);
    return { required, met: ballotCount >= required };
  }
  if (config.algorithm === 'majority') {
    return { required: 3, met: ballotCount >= 3 };
  }
  return { required: 1, met: ballotCount >= 1 };
}

/**
 * Shared ballot-box checks for majority and unanimous.
 * Returns a reason to escalate, or undefined when the box is usable.
 */
export function validateBallotBox(
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

  const missingConfidence = verdicts.filter((v) => typeof v.confidence !== 'number').length;
  if (missingConfidence > 0) {
    return `${missingConfidence} verdict(s) missing confidence`;
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

  return undefined;
}

function unanimousFailure(
  verdicts: readonly CouncilVerdictInput[],
  expectedAgentIds?: readonly string[],
): string | undefined {
  const box = validateBallotBox(verdicts, expectedAgentIds);
  if (box) return box;

  if (expectedAgentIds === undefined) {
    return 'missing expected agent roster';
  }

  const seen = new Set(verdicts.map((v) => canonicalAgentId(v.agentId)));
  const missing = expectedAgentIds.filter((id) => !seen.has(canonicalAgentId(id)));
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

  const nonApproving = verdicts.filter((v) => v.status !== 'APPROVED').length;
  if (nonApproving > 0) {
    return `${nonApproving} agent(s) did not approve`;
  }

  return undefined;
}

function escalated(
  verdicts: readonly CouncilVerdictInput[],
  summary: string,
  counts?: {
    approvedCount?: number;
    rejectedCount?: number;
    abstainedCount?: number;
    averageConfidence?: number;
    findings?: readonly CouncilFinding[];
  },
): CouncilVerdict {
  return {
    status: 'ESCALATED',
    totalAgents: verdicts.length,
    approvedCount: counts?.approvedCount ?? 0,
    rejectedCount: counts?.rejectedCount ?? 0,
    abstainedCount: counts?.abstainedCount ?? 0,
    vetoApplied: false,
    complianceVetoApplied: false,
    averageConfidence: counts?.averageConfidence,
    findings: counts?.findings ? [...counts.findings] : [],
    summary,
    individualVerdicts: verdicts,
  };
}

/**
 * Compute council consensus from N verdicts.
 *
 * Rules:
 *  - Ballot box (roster, duplicates, invalid status, missing confidence) applies
 *    to majority and unanimous — failure → ESCALATED
 *  - Quorum: config.quorum, else ceil(roster/2), else majority-without-roster requires 3
 *  - Security/compliance veto (including derived security-critical findings) → REJECTED
 *  - criticalFindingsPolicy (default escalate) after explicit vetos
 *  - confidence < 0.6 or average < 0.7 → ESCALATED
 *  - majority: APPROVED if approvedCount > rejectedCount
 *  - unanimous: every expected agent approved exactly once
 *  - Empty input → ESCALATED
 */
export function councilConsensus(
  verdicts: readonly CouncilVerdictInput[],
  config: ConsensusConfig = DEFAULT_CONFIG,
): CouncilVerdict {
  const totalAgents = verdicts.length;

  if (totalAgents === 0) {
    return escalated(verdicts, 'No verdicts submitted — escalated for human review.');
  }

  const ballotFailure = validateBallotBox(verdicts, config.expectedAgentIds);
  if (ballotFailure) {
    return escalated(
      verdicts,
      `Ballot box invalid: ${ballotFailure} — escalated for human review.`,
    );
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
  const allowCompliance =
    typeof config.allowComplianceVeto === 'boolean' ? config.allowComplianceVeto : true;
  const policy = config.criticalFindingsPolicy ?? 'escalate';

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

    if (typeof v.confidence !== 'number') {
      return escalated(verdicts, 'Ballot box invalid: verdict(s) missing confidence — escalated for human review.');
    }
    const confidence = v.confidence;
    totalConfidence += confidence;
    if (confidence < 0.6) {
      hasLowConfidence = true;
    }

    if (config.allowSecurityVeto && v.securityVeto && v.status === 'REJECTED') {
      vetoApplied = true;
      vetoByAgentId = v.agentId;
    }

    if (allowCompliance && v.complianceVeto && v.status === 'REJECTED') {
      complianceVetoApplied = true;
      vetoByAgentId = v.agentId;
    }

    for (const finding of v.findings) {
      allFindings.push(finding);
      if (
        config.allowSecurityVeto &&
        finding.severity === 'critical' &&
        isSecurityCategory(finding.category)
      ) {
        vetoApplied = true;
        vetoByAgentId = v.agentId;
      }
    }
  }

  const averageConfidence = totalConfidence / totalAgents;
  const counts = {
    approvedCount,
    rejectedCount,
    abstainedCount,
    averageConfidence,
    findings: allFindings,
  };

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

  const critical = allFindings.filter((f) => f.severity === 'critical');
  if (critical.length > 0 && policy === 'reject') {
    return {
      status: 'REJECTED',
      totalAgents,
      approvedCount,
      rejectedCount,
      abstainedCount,
      vetoApplied: false,
      complianceVetoApplied: false,
      averageConfidence,
      findings: allFindings,
      summary: `${critical.length} critical finding(s) — rejected by criticalFindingsPolicy.`,
      individualVerdicts: verdicts,
    };
  }
  if (critical.length > 0 && policy === 'escalate') {
    return escalated(
      verdicts,
      `${critical.length} critical finding(s) — escalated by criticalFindingsPolicy.`,
      counts,
    );
  }

  const quorum = resolveQuorum(config, totalAgents);
  if (!quorum.met) {
    return escalated(
      verdicts,
      `Quorum not reached (${totalAgents}/${quorum.required}) — escalated for human review.`,
      counts,
    );
  }

  if (hasLowConfidence || averageConfidence < 0.7) {
    const reason = hasLowConfidence
      ? 'one or more agents reported confidence below 0.6'
      : `average confidence (${averageConfidence.toFixed(2)}) is below 0.7`;
    return escalated(verdicts, `Confidence threshold breach: ${reason} — escalated for human review.`, {
      approvedCount,
      rejectedCount,
      abstainedCount,
      averageConfidence,
      findings: allFindings,
    });
  }

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

    return escalated(
      verdicts,
      `Unanimity not reached: ${failure} — escalated for human review.`,
      {
        approvedCount,
        rejectedCount,
        abstainedCount,
        averageConfidence,
        findings: allFindings,
      },
    );
  }

  return escalated(
    verdicts,
    `No clear consensus (${approvedCount} approved, ${rejectedCount} rejected, ${abstainedCount} abstained) — escalated for human review.`,
    {
      approvedCount,
      rejectedCount,
      abstainedCount,
      averageConfidence,
      findings: allFindings,
    },
  );
}
