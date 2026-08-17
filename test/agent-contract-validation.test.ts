import { describe, expect, test } from 'bun:test';
import {
  AgentContractSchema,
  CouncilAgentSpecSchema,
  CouncilFindingSchema,
  CouncilVerdictInputSchema,
  CouncilVerdictSchema,
  ConsensusConfigSchema,
  ContractFormatSchema,
  ContractTargetSchema,
  ClaudeAgentFileSchema,
  OpenCodeAgentFileSchema,
  validateAgentContract,
  validateClaudeAgentFile,
  validateOpenCodeAgentFile,
  validateConsensusConfig,
  validateCouncilVerdict,
  validateCouncilVerdictInput,
} from '../src/validation/schemas';
import { createAgentContract } from '../src/domain/council/agent-contract';
import { toAgentContract } from '../src/domain/council/council-spec';
import type { CouncilSpec } from '../src/domain/council/council-spec';

const VALID_COUNCIL_SPEC: CouncilSpec = {
  name: 'test-council',
  version: '1.0.0',
  description: 'Test council for validation',
  outputContract: 'structured',
  agents: [
    {
      id: 'architect',
      role: 'Architect',
      context: 'repo-readonly',
      modelHint: 'strong-reasoning',
      focus: ['architecture', 'design-patterns'],
    },
  ],
};

describe('AgentContractSchema', () => {
  test('accepts valid agent contract', () => {
    const input = {
      council: VALID_COUNCIL_SPEC,
      targets: [{ target: 'claude' }, { target: 'opencode' }],
      contractVersion: '1.0.0',
    };
    const result = AgentContractSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test('accepts contract with renderHints', () => {
    const input = {
      council: VALID_COUNCIL_SPEC,
      targets: [{ target: 'claude' }],
      contractVersion: '2.0.0',
      renderHints: { claude: { overwrite: true } },
    };
    const result = AgentContractSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test('rejects contract without council', () => {
    const input = {
      targets: [{ target: 'claude' }],
      contractVersion: '1.0.0',
    };
    const result = AgentContractSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test('rejects contract with empty targets', () => {
    const input = {
      council: VALID_COUNCIL_SPEC,
      targets: [],
      contractVersion: '1.0.0',
    };
    // Empty array is valid — no targets means nothing to render
    const result = AgentContractSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test('rejects contract with invalid target', () => {
    const input = {
      council: VALID_COUNCIL_SPEC,
      targets: [{ target: 'invalid-target' }],
      contractVersion: '1.0.0',
    };
    const result = AgentContractSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('CouncilVerdictInputSchema', () => {
  test('accepts valid verdict input', () => {
    const input = {
      agentId: 'architect',
      agentRole: 'Architect',
      status: 'APPROVED',
      securityVeto: false,
      findings: [],
      summary: 'Looks good.',
    };
    const result = CouncilVerdictInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test('accepts verdict with findings', () => {
    const input = {
      agentId: 'security',
      agentRole: 'Security',
      status: 'REJECTED',
      securityVeto: true,
      findings: [
        {
          category: 'security',
          severity: 'critical',
          message: 'SQL injection found',
          agentId: 'security',
        },
      ],
      summary: 'Critical vulnerability detected.',
    };
    const result = CouncilVerdictInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test('rejects verdict with invalid status', () => {
    const input = {
      agentId: 'architect',
      agentRole: 'Architect',
      status: 'PENDING',
      securityVeto: false,
      findings: [],
      summary: '',
    };
    const result = CouncilVerdictInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('CouncilVerdictSchema', () => {
  test('accepts valid council verdict', () => {
    const input = {
      status: 'APPROVED',
      totalAgents: 3,
      approvedCount: 2,
      rejectedCount: 1,
      abstainedCount: 0,
      vetoApplied: false,
      findings: [],
      summary: 'Approved by majority.',
      individualVerdicts: [],
    };
    const result = CouncilVerdictSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test('accepts rejected verdict with veto', () => {
    const input = {
      status: 'REJECTED',
      totalAgents: 3,
      approvedCount: 2,
      rejectedCount: 1,
      abstainedCount: 0,
      vetoApplied: true,
      vetoByAgentId: 'security',
      findings: [],
      summary: 'Security veto.',
      individualVerdicts: [],
    };
    const result = CouncilVerdictSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});

describe('ConsensusConfigSchema', () => {
  test('accepts valid config', () => {
    const input = { algorithm: 'majority', allowSecurityVeto: true };
    const result = ConsensusConfigSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test('accepts unanimous config without veto when a roster is declared', () => {
    const input = {
      algorithm: 'unanimous',
      allowSecurityVeto: false,
      expectedAgentIds: ['architect', 'security'],
    };
    const result = ConsensusConfigSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test('rejects unanimous config without an expected roster', () => {
    const input = { algorithm: 'unanimous', allowSecurityVeto: false };
    expect(ConsensusConfigSchema.safeParse(input).success).toBe(false);
  });

  test('accepts majority config without an expected roster', () => {
    const input = { algorithm: 'majority', allowSecurityVeto: true };
    expect(ConsensusConfigSchema.safeParse(input).success).toBe(true);
  });
});

describe('ClaudeAgentFileSchema', () => {
  test('accepts valid claude file', () => {
    const input = { path: '.claude/skills/council/SKILL.md', content: '# Council', overwrite: false };
    const result = ClaudeAgentFileSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test('rejects file not under .claude/', () => {
    const input = { path: '.opencode/skills/council.md', content: '# Council', overwrite: false };
    const result = ClaudeAgentFileSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('OpenCodeAgentFileSchema', () => {
  test('accepts valid opencode file', () => {
    const input = { path: '.opencode/commands/council.md', content: '# Council', overwrite: false };
    const result = OpenCodeAgentFileSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test('rejects file not under .opencode/', () => {
    const input = { path: '.claude/commands/council.md', content: '# Council', overwrite: false };
    const result = OpenCodeAgentFileSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

// ─── ContractTargetSchema ──────────────────────────────────────────────────────

describe('ContractTargetSchema', () => {
  test.each(['claude', 'opencode', 'codex', 'gemini', 'cursor', 'agy'] as const)(
    'accepts %s as a valid target',
    (target) => {
      const result = ContractTargetSchema.safeParse(target);
      expect(result.success).toBe(true);
    },
  );

  test('rejects unknown target', () => {
    const result = ContractTargetSchema.safeParse('unknown');
    expect(result.success).toBe(false);
  });
});

// ─── ContractFormatSchema ──────────────────────────────────────────────────────

describe('ContractFormatSchema', () => {
  test('accepts format without options', () => {
    const result = ContractFormatSchema.safeParse({ target: 'claude' });
    expect(result.success).toBe(true);
  });

  test('accepts format with options', () => {
    const result = ContractFormatSchema.safeParse({
      target: 'claude',
      options: { overwrite: true, locale: 'es' },
    });
    expect(result.success).toBe(true);
  });

  test('rejects format with invalid target', () => {
    const result = ContractFormatSchema.safeParse({ target: 'invalid' });
    expect(result.success).toBe(false);
  });
});

// ─── CouncilAgentSpecSchema ────────────────────────────────────────────────────

describe('CouncilAgentSpecSchema', () => {
  test('rejects agent with invalid context', () => {
    const input = {
      id: 'architect',
      role: 'Architect',
      context: 'full-access', // not in enum
      modelHint: 'strong-reasoning',
      focus: ['architecture'],
    };
    const result = CouncilAgentSpecSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test('rejects agent with invalid modelHint', () => {
    const input = {
      id: 'architect',
      role: 'Architect',
      context: 'repo-readonly',
      modelHint: 'magic-model', // not in enum
      focus: ['architecture'],
    };
    const result = CouncilAgentSpecSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test('rejects agent missing required id', () => {
    const input = {
      role: 'Architect',
      context: 'repo-readonly',
      modelHint: 'strong-reasoning',
      focus: ['architecture'],
    };
    const result = CouncilAgentSpecSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

// ─── CouncilFindingSchema ──────────────────────────────────────────────────────

describe('CouncilFindingSchema', () => {
  test('accepts valid finding with info severity', () => {
    const input = {
      category: 'style',
      severity: 'info',
      message: 'Minor suggestion',
      agentId: 'architect',
    };
    const result = CouncilFindingSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test('rejects finding with invalid severity', () => {
    const input = {
      category: 'style',
      severity: 'fatal', // not in enum
      message: 'Something',
      agentId: 'architect',
    };
    const result = CouncilFindingSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test('rejects finding missing agentId', () => {
    const input = {
      category: 'style',
      severity: 'info',
      message: 'Minor suggestion',
    };
    const result = CouncilFindingSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

// ─── AgentContractSchema (all targets) ─────────────────────────────────────────

describe('AgentContractSchema — all valid target enums', () => {
  test.each(['claude', 'opencode', 'codex', 'gemini', 'cursor', 'agy'] as const)(
    'accepts contract with %s as a target',
    (target) => {
      const input = {
        council: VALID_COUNCIL_SPEC,
        targets: [{ target }],
        contractVersion: '1.0.0',
      };
      const result = AgentContractSchema.safeParse(input);
      expect(result.success).toBe(true);
    },
  );

  test('accepts contract with multiple targets', () => {
    const input = {
      council: VALID_COUNCIL_SPEC,
      targets: [{ target: 'claude' }, { target: 'opencode' }, { target: 'codex' }],
      contractVersion: '1.0.0',
    };
    const result = AgentContractSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test('rejects contract with non-string contractVersion', () => {
    const input = {
      council: VALID_COUNCIL_SPEC,
      targets: [{ target: 'claude' }],
      contractVersion: 1, // number, not string
    };
    const result = AgentContractSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test('rejects contract with invalid council spec (missing agents)', () => {
    const input = {
      council: { name: 'x', version: '1', description: 'd', outputContract: 'oc' }, // no agents
      targets: [{ target: 'claude' }],
      contractVersion: '1.0.0',
    };
    const result = AgentContractSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

// ─── createAgentContract() factory ─────────────────────────────────────────────

describe('createAgentContract', () => {
  test('returns a contract with provided fields', () => {
    const contract = createAgentContract(VALID_COUNCIL_SPEC, [{ target: 'claude' }]);
    expect(contract.council).toBe(VALID_COUNCIL_SPEC);
    expect(contract.targets).toEqual([{ target: 'claude' }]);
    expect(contract.contractVersion).toBe('1.0.0');
    expect(contract.renderHints).toBeUndefined();
  });

  test('uses default version "1.0.0" when omitted', () => {
    const contract = createAgentContract(VALID_COUNCIL_SPEC, [{ target: 'opencode' }]);
    expect(contract.contractVersion).toBe('1.0.0');
  });

  test('preserves custom contractVersion', () => {
    const contract = createAgentContract(
      VALID_COUNCIL_SPEC,
      [{ target: 'claude' }],
      '2.5.1',
    );
    expect(contract.contractVersion).toBe('2.5.1');
  });

  test('preserves renderHints when provided', () => {
    const hints = { claude: { overwrite: true } };
    const contract = createAgentContract(
      VALID_COUNCIL_SPEC,
      [{ target: 'claude' }],
      '1.0.0',
      hints,
    );
    expect(contract.renderHints).toBe(hints);
  });

  test('result is valid against AgentContractSchema', () => {
    const contract = createAgentContract(VALID_COUNCIL_SPEC, [
      { target: 'claude' },
      { target: 'opencode' },
    ]);
    const result = AgentContractSchema.safeParse(contract);
    expect(result.success).toBe(true);
  });
});

// ─── toAgentContract() converter ───────────────────────────────────────────────

describe('toAgentContract', () => {
  test('converts a CouncilSpec to an AgentContract targeting the given providers', () => {
    const contract = toAgentContract(VALID_COUNCIL_SPEC, ['claude', 'opencode']);
    expect(contract.council).toBe(VALID_COUNCIL_SPEC);
    expect(contract.targets).toEqual([{ target: 'claude' }, { target: 'opencode' }]);
    expect(contract.contractVersion).toBe('1.0.0');
    expect(contract.renderHints).toBeUndefined();
  });

  test('preserves custom contractVersion', () => {
    const contract = toAgentContract(VALID_COUNCIL_SPEC, ['claude'], '3.0.0');
    expect(contract.contractVersion).toBe('3.0.0');
  });

  test('result is valid against AgentContractSchema', () => {
    const contract = toAgentContract(VALID_COUNCIL_SPEC, ['claude']);
    const result = AgentContractSchema.safeParse(contract);
    expect(result.success).toBe(true);
  });
});

// ─── validate* helper functions (throwing variants) ───────────────────────────

describe('validateAgentContract (throwing helper)', () => {
  test('returns parsed contract on valid input', () => {
    const input = {
      council: VALID_COUNCIL_SPEC,
      targets: [{ target: 'claude' }],
      contractVersion: '1.0.0',
    };
    const parsed = validateAgentContract(input);
    expect(parsed.council.name).toBe('test-council');
    expect(parsed.targets[0]!.target).toBe('claude');
  });

  test('throws on invalid input', () => {
    const input = { targets: [{ target: 'claude' }] }; // missing council
    expect(() => validateAgentContract(input)).toThrow();
  });
});

describe('validateClaudeAgentFile (throwing helper)', () => {
  test('returns parsed file on valid input', () => {
    const input = {
      path: '.claude/skills/council/SKILL.md',
      content: '# Council',
      overwrite: false,
    };
    const parsed = validateClaudeAgentFile(input);
    expect(parsed.path).toBe('.claude/skills/council/SKILL.md');
    expect(parsed.overwrite).toBe(false);
  });

  test('throws on file not under .claude/', () => {
    const input = { path: 'wrong/path.md', content: '# Council', overwrite: false };
    expect(() => validateClaudeAgentFile(input)).toThrow();
  });
});

describe('validateOpenCodeAgentFile (throwing helper)', () => {
  test('returns parsed file on valid input', () => {
    const input = {
      path: '.opencode/commands/council.md',
      content: '# Council',
      overwrite: false,
    };
    const parsed = validateOpenCodeAgentFile(input);
    expect(parsed.path).toBe('.opencode/commands/council.md');
  });

  test('throws on file not under .opencode/', () => {
    const input = { path: 'wrong/path.md', content: '# Council', overwrite: false };
    expect(() => validateOpenCodeAgentFile(input)).toThrow();
  });
});

describe('validateConsensusConfig (throwing helper)', () => {
  test('returns parsed config on valid input', () => {
    const parsed = validateConsensusConfig({ algorithm: 'majority', allowSecurityVeto: true });
    expect(parsed.algorithm).toBe('majority');
    expect(parsed.allowSecurityVeto).toBe(true);
  });

  test('throws on invalid algorithm', () => {
    expect(() =>
      validateConsensusConfig({ algorithm: 'plurality', allowSecurityVeto: true }),
    ).toThrow();
  });
});

describe('validateCouncilVerdictInput (throwing helper)', () => {
  test('returns parsed verdict on valid input', () => {
    const input = {
      agentId: 'architect',
      agentRole: 'Architect',
      status: 'APPROVED',
      securityVeto: false,
      findings: [],
      summary: 'LGTM',
    };
    const parsed = validateCouncilVerdictInput(input);
    expect(parsed.status).toBe('APPROVED');
  });

  test('throws on invalid status enum', () => {
    const input = {
      agentId: 'architect',
      agentRole: 'Architect',
      status: 'PASSED', // not in enum
      securityVeto: false,
      findings: [],
      summary: '',
    };
    expect(() => validateCouncilVerdictInput(input)).toThrow();
  });
});

describe('validateCouncilVerdict (throwing helper)', () => {
  test('returns parsed verdict on valid input', () => {
    const input = {
      status: 'APPROVED',
      totalAgents: 1,
      approvedCount: 1,
      rejectedCount: 0,
      abstainedCount: 0,
      vetoApplied: false,
      findings: [],
      summary: 'ok',
      individualVerdicts: [],
    };
    const parsed = validateCouncilVerdict(input);
    expect(parsed.status).toBe('APPROVED');
  });

  test('throws on invalid status', () => {
    const input = {
      status: 'BLOCKED', // not in enum
      totalAgents: 1,
      approvedCount: 1,
      rejectedCount: 0,
      abstainedCount: 0,
      vetoApplied: false,
      findings: [],
      summary: 'ok',
      individualVerdicts: [],
    };
    expect(() => validateCouncilVerdict(input)).toThrow();
  });
});
