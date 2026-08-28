import { describe, expect, test } from 'bun:test';
import type { CouncilSpec } from '../src/domain/council/council-spec';
import {
  DEFAULT_COUNCIL_AGENTS,
  toAgentContract,
} from '../src/domain/council/council-spec';
import { ClaudeAgentContractRenderer } from '../src/adapters/claude/agent-contract-renderer';
import { OpenCodeAgentContractRenderer } from '../src/adapters/opencode/agent-contract-renderer';
import { validateClaudeAgentFile, validateOpenCodeAgentFile } from '../src/validation/schemas';
import {
  councilConsensus,
  type ConsensusConfig,
  type CouncilVerdictInput,
} from '../src/domain/council/council-consensus';

/**
 * Integration tests for AgentContract — Council Consensus — Provider Renderer.
 *
 * These tests exercise the full happy path: define a CouncilSpec, convert it
 * to an AgentContract, render it for multiple providers, validate the rendered
 * output against the provider-specific schema, synthesize structured JSON
 * verdicts, and run them through the consensus engine. They prove that the
 * pieces of the feature work together end-to-end.
 */

const SPEC: CouncilSpec = {
  name: 'integration-council',
  version: '1.0.0',
  description: 'Integration test council',
  outputContract: 'structured',
  agents: DEFAULT_COUNCIL_AGENTS,
};

const MAJORITY_WITH_VETO: ConsensusConfig = {
  algorithm: 'majority',
  allowSecurityVeto: true,
};

function verdict(
  agentId: string,
  status: 'APPROVED' | 'REJECTED' | 'ABSTAIN',
  securityVeto = false,
): CouncilVerdictInput {
  return {
    agentId,
    agentRole: agentId.charAt(0).toUpperCase() + agentId.slice(1),
    status,
    securityVeto,
    confidence: 1,
    findings: [
      {
        category: 'integration',
        severity: 'info',
        message: `Vote from ${agentId}`,
        agentId,
      },
    ],
    summary: `${agentId} → ${status}`,
  };
}

function vetoVerdict(agentId: string): CouncilVerdictInput {
  return {
    agentId,
    agentRole: agentId.charAt(0).toUpperCase() + agentId.slice(1),
    status: 'REJECTED',
    securityVeto: true,
    confidence: 1,
    findings: [
      {
        category: 'security',
        severity: 'critical',
        message: `${agentId} applied security veto`,
        agentId,
      },
    ],
    summary: `${agentId} applied security veto`,
  };
}

// ─── End-to-end happy path ────────────────────────────────────────────────────

describe('end-to-end: contract → render → validate → consensus', () => {
  test('single AgentContract renders for both providers and produces APPROVED consensus', () => {
    // 1. Convert a CouncilSpec to an AgentContract targeting BOTH providers
    const contract = toAgentContract(SPEC, ['claude', 'opencode']);
    expect(contract.targets).toHaveLength(2);

    // 2. Render for Claude
    const claudeRenderer = new ClaudeAgentContractRenderer();
    const claudeResult = claudeRenderer.render(contract);
    expect(claudeResult.allValid).toBe(true);
    expect(claudeResult.target).toBe('claude');

    // 3. Render for OpenCode
    const opencodeRenderer = new OpenCodeAgentContractRenderer();
    const opencodeResult = opencodeRenderer.render(contract);
    expect(opencodeResult.allValid).toBe(true);
    expect(opencodeResult.target).toBe('opencode');

    // 4. Validate every rendered file against the provider-specific schema
    for (const file of claudeResult.files) {
      const parsed = validateClaudeAgentFile(file);
      expect(parsed.path).toMatch(/^\.claude\//);
    }
    for (const file of opencodeResult.files) {
      const parsed = validateOpenCodeAgentFile(file);
      expect(parsed.path).toMatch(/^\.opencode\//);
    }

    // 5. Synthesize N structured JSON verdicts (one per council agent) — APPROVED
    const verdicts: CouncilVerdictInput[] = SPEC.agents.map((a) => verdict(a.id, 'APPROVED'));

    // 6. Run consensus → unanimous approval
    const consensus = councilConsensus(verdicts, MAJORITY_WITH_VETO);
    expect(consensus.status).toBe('APPROVED');
    expect(consensus.approvedCount).toBe(SPEC.agents.length);
    expect(consensus.rejectedCount).toBe(0);
    expect(consensus.vetoApplied).toBe(false);
    expect(consensus.individualVerdicts).toHaveLength(SPEC.agents.length);
  });

  test('security veto by one of N agents → REJECTED even with majority approvals', () => {
    const contract = toAgentContract(SPEC, ['claude', 'opencode']);
    const claudeResult = new ClaudeAgentContractRenderer().render(contract);
    const opencodeResult = new OpenCodeAgentContractRenderer().render(contract);
    expect(claudeResult.allValid).toBe(true);
    expect(opencodeResult.allValid).toBe(true);

    // All agents approve except 'security' which applies veto
    const verdicts: CouncilVerdictInput[] = SPEC.agents.map((a) =>
      a.id === 'security' ? vetoVerdict(a.id) : verdict(a.id, 'APPROVED'),
    );

    const consensus = councilConsensus(verdicts, MAJORITY_WITH_VETO);
    expect(consensus.status).toBe('REJECTED');
    expect(consensus.vetoApplied).toBe(true);
    expect(consensus.vetoByAgentId).toBe('security');
    expect(consensus.approvedCount).toBe(SPEC.agents.length - 1);
    expect(consensus.rejectedCount).toBe(1);
  });
});

// ─── JSON / YAML-style contract loading ───────────────────────────────────────

describe('JSON-defined AgentContract', () => {
  test('JSON-defined contract passes validation and renders for both providers', () => {
    // The Task Card explicitly mentions "YAML/JSON definition".
    // This proves that a contract defined as a JSON string (the format used
    // by config files and serialization layers) can be loaded, validated, and
    // rendered end-to-end.
    const json = JSON.stringify({
      council: SPEC,
      targets: [{ target: 'claude' }, { target: 'opencode' }],
      contractVersion: '1.0.0',
    });
    const contract = JSON.parse(json);

    // Validate the parsed contract
    expect(contract.council).toBeDefined();
    expect(contract.targets).toHaveLength(2);
    expect(contract.contractVersion).toBe('1.0.0');

    // Render
    const claudeResult = new ClaudeAgentContractRenderer().render(contract);
    const opencodeResult = new OpenCodeAgentContractRenderer().render(contract);

    expect(claudeResult.allValid).toBe(true);
    expect(opencodeResult.allValid).toBe(true);
    expect(claudeResult.files.length).toBeGreaterThan(0);
    expect(opencodeResult.files.length).toBeGreaterThan(0);
  });

  test('JSON-defined contract with only one target renders only that target', () => {
    const json = JSON.stringify({
      council: SPEC,
      targets: [{ target: 'claude' }],
      contractVersion: '1.0.0',
    });
    const contract = JSON.parse(json);

    const claudeResult = new ClaudeAgentContractRenderer().render(contract);
    const opencodeResult = new OpenCodeAgentContractRenderer().render(contract);

    expect(claudeResult.allValid).toBe(true);
    expect(opencodeResult.allValid).toBe(false);
    expect(opencodeResult.errors[0]).toContain('does not include target: opencode');
  });
});
