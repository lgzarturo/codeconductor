import { describe, expect, test } from 'bun:test';
import type { AgentContract } from '../src/domain/council/agent-contract';
import type { CouncilSpec } from '../src/domain/council/council-spec';
import { ClaudeAgentContractRenderer } from '../src/adapters/claude/agent-contract-renderer';
import { OpenCodeAgentContractRenderer } from '../src/adapters/opencode/agent-contract-renderer';
import { CodexAgentContractRenderer } from '../src/adapters/codex/agent-contract-renderer';
import { AgyAgentContractRenderer } from '../src/adapters/agy/agent-contract-renderer';
import { validateClaudeAgentFile, validateOpenCodeAgentFile } from '../src/validation/schemas';

const SPEC: CouncilSpec = {
  name: 'test-council',
  version: '1.0.0',
  description: 'Test council for renderer round-trip',
  outputContract: 'structured',
  agents: [
    {
      id: 'architect',
      role: 'Architect',
      context: 'repo-readonly',
      modelHint: 'strong-reasoning',
      focus: ['architecture', 'design-patterns'],
    },
    {
      id: 'security',
      role: 'Security',
      context: 'repo-readonly',
      modelHint: 'security-reasoning',
      focus: ['security', 'vulnerabilities'],
    },
    {
      id: 'product',
      role: 'Product',
      context: 'prompt-only',
      modelHint: 'balanced',
      focus: ['requirements', 'ux'],
    },
  ],
};

function createContract(
  targets: readonly ('claude' | 'opencode' | 'codex' | 'gemini' | 'cursor' | 'agy')[],
): AgentContract {
  return {
    council: SPEC,
    targets: targets.map((target) => ({ target })),
    contractVersion: '1.0.0',
  };
}

// ─── Claude Renderer ───────────────────────────────────────────────────────────

describe('ClaudeAgentContractRenderer', () => {
  test('round-trip: AgentContract → Claude renderer → all files under .claude/', () => {
    const renderer = new ClaudeAgentContractRenderer();
    const contract = createContract(['claude']);
    const result = renderer.render(contract);

    expect(result.allValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.files.length).toBeGreaterThan(0);

    for (const file of result.files) {
      expect(file.path).toMatch(/^\.claude\//);
      expect(file.content.length).toBeGreaterThan(0);
    }
  });

  test('generates skill file for council', () => {
    const renderer = new ClaudeAgentContractRenderer();
    const contract = createContract(['claude']);
    const result = renderer.render(contract);

    const skillFile = result.files.find((f) => f.path.includes('/skills/council/'));
    expect(skillFile).toBeDefined();
    expect(skillFile!.content).toContain('Council Skill');
    expect(skillFile!.content).toContain(SPEC.version);
  });

  test('generates agent files for each council agent', () => {
    const renderer = new ClaudeAgentContractRenderer();
    const contract = createContract(['claude']);
    const result = renderer.render(contract);

    const agentFiles = result.files.filter((f) => f.path.includes('/agents/'));
    expect(agentFiles.length).toBe(SPEC.agents.length);
  });

  test('generates command file', () => {
    const renderer = new ClaudeAgentContractRenderer();
    const contract = createContract(['claude']);
    const result = renderer.render(contract);

    const commandFile = result.files.find((f) => f.path.includes('/commands/'));
    expect(commandFile).toBeDefined();
  });

  test('fails when contract does not include claude target', () => {
    const renderer = new ClaudeAgentContractRenderer();
    const contract = createContract(['opencode']);
    const result = renderer.render(contract);

    expect(result.allValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.files).toHaveLength(0);
  });

  test('fails validation when CouncilSpec has no agents', () => {
    const renderer = new ClaudeAgentContractRenderer();
    const contract: AgentContract = {
      council: { name: '', version: '', description: '', outputContract: '', agents: [] } as CouncilSpec,
      targets: [{ target: 'claude' }],
      contractVersion: '1.0.0',
    };
    // CouncilSpecSchema passes (empty agents is valid), but generated output
    // lacks agent files → validation fails
    const result = renderer.render(contract);
    expect(result.allValid).toBe(false);
    expect(result.errors.some((e) => e.includes('agent file'))).toBe(true);
  });
});

// ─── OpenCode Renderer ─────────────────────────────────────────────────────────

describe('OpenCodeAgentContractRenderer', () => {
  test('round-trip: AgentContract → OpenCode renderer → all files under .opencode/', () => {
    const renderer = new OpenCodeAgentContractRenderer();
    const contract = createContract(['opencode']);
    const result = renderer.render(contract);

    expect(result.allValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.files.length).toBeGreaterThan(0);

    for (const file of result.files) {
      expect(file.path).toMatch(/^\.opencode\//);
      expect(file.content.length).toBeGreaterThan(0);
    }
  });

  test('generated agent files have frontmatter', () => {
    const renderer = new OpenCodeAgentContractRenderer();
    const contract = createContract(['opencode']);
    const result = renderer.render(contract);

    const agentFiles = result.files.filter((f) => f.path.includes('/agents/'));
    for (const file of agentFiles) {
      expect(file.content.startsWith('---')).toBe(true);
    }
  });

  test('generated command file has frontmatter', () => {
    const renderer = new OpenCodeAgentContractRenderer();
    const contract = createContract(['opencode']);
    const result = renderer.render(contract);

    const commandFiles = result.files.filter((f) => f.path.includes('/commands/'));
    for (const file of commandFiles) {
      expect(file.content.startsWith('---')).toBe(true);
    }
  });

  test('generates lead agent and individual agent files', () => {
    const renderer = new OpenCodeAgentContractRenderer();
    const contract = createContract(['opencode']);
    const result = renderer.render(contract);

    const leadAgent = result.files.find((f) => f.path.includes('council-lead'));
    expect(leadAgent).toBeDefined();

    const agentFiles = result.files.filter(
      (f) => f.path.includes('/agents/council-') && !f.path.includes('council-lead'),
    );
    expect(agentFiles.length).toBe(SPEC.agents.length);
  });

  test('fails when contract does not include opencode target', () => {
    const renderer = new OpenCodeAgentContractRenderer();
    const contract = createContract(['claude']);
    const result = renderer.render(contract);

    expect(result.allValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.files).toHaveLength(0);
  });
});

// ─── Malformed render edge cases ──────────────────────────────────────────────

describe('malformed render handling', () => {
  test('Claude renderer returns allValid=false for missing target', () => {
    const renderer = new ClaudeAgentContractRenderer();
    const contract = createContract(['opencode']);
    const result = renderer.render(contract);
    expect(result.allValid).toBe(false);
  });

  test('OpenCode renderer returns allValid=false for missing target', () => {
    const renderer = new OpenCodeAgentContractRenderer();
    const contract = createContract(['claude']);
    const result = renderer.render(contract);
    expect(result.allValid).toBe(false);
  });
});

// ─── Round-trip: rendered files pass provider-specific schema validation ──────

describe('Claude renderer → schema validation round-trip', () => {
  test('every rendered Claude file passes ClaudeAgentFileSchema validation', () => {
    const renderer = new ClaudeAgentContractRenderer();
    const contract = createContract(['claude']);
    const result = renderer.render(contract);

    expect(result.allValid).toBe(true);
    expect(result.errors).toHaveLength(0);

    for (const file of result.files) {
      // Should not throw — every file must conform to ClaudeAgentFileSchema
      const parsed = validateClaudeAgentFile(file);
      expect(parsed.path).toBe(file.path);
      expect(parsed.content).toBe(file.content);
      expect(parsed.overwrite).toBe(file.overwrite);
    }
  });
});

describe('OpenCode renderer → schema validation round-trip', () => {
  test('every rendered OpenCode file passes OpenCodeAgentFileSchema validation', () => {
    const renderer = new OpenCodeAgentContractRenderer();
    const contract = createContract(['opencode']);
    const result = renderer.render(contract);

    expect(result.allValid).toBe(true);
    expect(result.errors).toHaveLength(0);

    for (const file of result.files) {
      // Should not throw — every file must conform to OpenCodeAgentFileSchema
      const parsed = validateOpenCodeAgentFile(file);
      expect(parsed.path).toBe(file.path);
      expect(parsed.content).toBe(file.content);
      expect(parsed.overwrite).toBe(file.overwrite);
    }
  });
});

// ─── Multi-target single contract ──────────────────────────────────────────────

describe('single contract → both providers', () => {
  test('renders correctly for both Claude and OpenCode from one AgentContract', () => {
    const contract = createContract(['claude', 'opencode']);

    const claudeResult = new ClaudeAgentContractRenderer().render(contract);
    const opencodeResult = new OpenCodeAgentContractRenderer().render(contract);

    expect(claudeResult.allValid).toBe(true);
    expect(opencodeResult.allValid).toBe(true);

    expect(claudeResult.target).toBe('claude');
    expect(opencodeResult.target).toBe('opencode');

    for (const file of claudeResult.files) {
      expect(file.path).toMatch(/^\.claude\//);
    }
    for (const file of opencodeResult.files) {
      expect(file.path).toMatch(/^\.opencode\//);
    }

    // The two outputs should be disjoint in their paths
    for (const cf of claudeResult.files) {
      for (const of of opencodeResult.files) {
        expect(cf.path).not.toBe(of.path);
      }
    }
  });
});

// ─── JSON serialization round-trip ─────────────────────────────────────────────

describe('JSON serialization round-trip', () => {
  test('Claude: contract survives JSON.stringify → JSON.parse and renders identically', () => {
    const renderer = new ClaudeAgentContractRenderer();
    const original = createContract(['claude']);

    const json = JSON.stringify(original);
    const restored: AgentContract = JSON.parse(json);

    const originalResult = renderer.render(original);
    const restoredResult = renderer.render(restored);

    expect(restoredResult.allValid).toBe(true);
    expect(restoredResult.errors).toEqual(originalResult.errors);
    expect(restoredResult.files.length).toBe(originalResult.files.length);

    for (let i = 0; i < restoredResult.files.length; i++) {
      expect(restoredResult.files[i]!.path).toBe(originalResult.files[i]!.path);
      expect(restoredResult.files[i]!.content).toBe(originalResult.files[i]!.content);
    }
  });

  test('OpenCode: contract survives JSON.stringify → JSON.parse and renders identically', () => {
    const renderer = new OpenCodeAgentContractRenderer();
    const original = createContract(['opencode']);

    const json = JSON.stringify(original);
    const restored: AgentContract = JSON.parse(json);

    const originalResult = renderer.render(original);
    const restoredResult = renderer.render(restored);

    expect(restoredResult.allValid).toBe(true);
    expect(restoredResult.errors).toEqual(originalResult.errors);
    expect(restoredResult.files.length).toBe(originalResult.files.length);

    for (let i = 0; i < restoredResult.files.length; i++) {
      expect(restoredResult.files[i]!.path).toBe(originalResult.files[i]!.path);
      expect(restoredResult.files[i]!.content).toBe(originalResult.files[i]!.content);
    }
  });
});

// ─── renderHints metadata ──────────────────────────────────────────────────────

describe('renderHints metadata', () => {
  test('contract with renderHints still renders valid Claude output', () => {
    const renderer = new ClaudeAgentContractRenderer();
    const contract: AgentContract = {
      council: SPEC,
      targets: [{ target: 'claude' }],
      contractVersion: '1.0.0',
      renderHints: { claude: { overwrite: true } },
    };
    const result = renderer.render(contract);
    expect(result.allValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.files.length).toBeGreaterThan(0);
  });

  test('contract with renderHints still renders valid OpenCode output', () => {
    const renderer = new OpenCodeAgentContractRenderer();
    const contract: AgentContract = {
      council: SPEC,
      targets: [{ target: 'opencode' }],
      contractVersion: '1.0.0',
      renderHints: { opencode: { locale: 'es' } },
    };
    const result = renderer.render(contract);
    expect(result.allValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.files.length).toBeGreaterThan(0);
  });
});

// ─── Generator error path ──────────────────────────────────────────────────────

describe('generator error path', () => {
  test('Claude renderer: invalid CouncilSpec yields allValid=false with descriptive error', () => {
    const renderer = new ClaudeAgentContractRenderer();
    const contract: AgentContract = {
      // Force the Zod parse to fail by passing an invalid context value
      council: {
        name: 'broken',
        version: '1.0.0',
        description: 'broken council',
        outputContract: 'structured',
        agents: [
          {
            id: 'broken',
            role: 'Broken',
            // @ts-expect-error — invalid context to force schema failure
            context: 'superuser',
            modelHint: 'strong-reasoning',
            focus: [],
          },
        ],
      },
      targets: [{ target: 'claude' }],
      contractVersion: '1.0.0',
    };
    const result = renderer.render(contract);
    expect(result.allValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('Invalid CouncilSpec');
    expect(result.files).toHaveLength(0);
  });

  test('OpenCode renderer: invalid CouncilSpec yields allValid=false with descriptive error', () => {
    const renderer = new OpenCodeAgentContractRenderer();
    const contract: AgentContract = {
      council: {
        name: 'broken',
        version: '1.0.0',
        description: 'broken council',
        outputContract: 'structured',
        agents: [
          {
            id: 'broken',
            role: 'Broken',
            // @ts-expect-error — invalid modelHint to force schema failure
            modelHint: 'super-duper',
            context: 'repo-readonly',
            focus: [],
          },
        ],
      },
      targets: [{ target: 'opencode' }],
      contractVersion: '1.0.0',
    };
    const result = renderer.render(contract);
    expect(result.allValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('Invalid CouncilSpec');
    expect(result.files).toHaveLength(0);
  });
});

// ─── Codex Renderer ────────────────────────────────────────────────────────────

describe('CodexAgentContractRenderer', () => {
  test('round-trip: AgentContract → Codex renderer → all files under .codex/', () => {
    const renderer = new CodexAgentContractRenderer();
    const contract = createContract(['codex']);
    const result = renderer.render(contract);

    expect(result.allValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.files.length).toBeGreaterThan(0);

    for (const file of result.files) {
      expect(file.path).toMatch(/^\.codex\//);
      expect(file.content.length).toBeGreaterThan(0);
    }
  });

  test('generates skill file for council', () => {
    const renderer = new CodexAgentContractRenderer();
    const contract = createContract(['codex']);
    const result = renderer.render(contract);

    const skillFile = result.files.find((f) => f.path.includes('/skills/'));
    expect(skillFile).toBeDefined();
    expect(skillFile!.content).toContain('council');
    expect(skillFile!.content).toContain(SPEC.version);
  });

  test('generates agent files for each council agent', () => {
    const renderer = new CodexAgentContractRenderer();
    const contract = createContract(['codex']);
    const result = renderer.render(contract);

    const agentFiles = result.files.filter((f) => f.path.includes('/agents/'));
    expect(agentFiles.length).toBe(SPEC.agents.length);
  });

  test('generates config file', () => {
    const renderer = new CodexAgentContractRenderer();
    const contract = createContract(['codex']);
    const result = renderer.render(contract);

    const configFile = result.files.find((f) => f.path.includes('config.toml'));
    expect(configFile).toBeDefined();
  });

  test('fails when contract does not include codex target', () => {
    const renderer = new CodexAgentContractRenderer();
    const contract = createContract(['claude']);
    const result = renderer.render(contract);

    expect(result.allValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.files).toHaveLength(0);
  });

  test('fails validation when CouncilSpec has no agents', () => {
    const renderer = new CodexAgentContractRenderer();
    const contract: AgentContract = {
      council: { name: '', version: '', description: '', outputContract: '', agents: [] } as CouncilSpec,
      targets: [{ target: 'codex' }],
      contractVersion: '1.0.0',
    };
    const result = renderer.render(contract);
    expect(result.allValid).toBe(false);
    expect(result.errors.some((e) => e.includes('agent file'))).toBe(true);
  });
});

// ─── Agy Renderer ──────────────────────────────────────────────────────────────

describe('AgyAgentContractRenderer', () => {
  test('round-trip: AgentContract → Agy renderer → all files under .agents/', () => {
    const renderer = new AgyAgentContractRenderer();
    const contract = createContract(['agy']);
    const result = renderer.render(contract);

    expect(result.allValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.files.length).toBeGreaterThan(0);

    for (const file of result.files) {
      expect(file.path).toMatch(/^\.agents\//);
      expect(file.content.length).toBeGreaterThan(0);
    }
  });

  test('generates skill file for council', () => {
    const renderer = new AgyAgentContractRenderer();
    const contract = createContract(['agy']);
    const result = renderer.render(contract);

    const skillFile = result.files.find((f) => f.path.includes('/skills/'));
    expect(skillFile).toBeDefined();
    expect(skillFile!.content).toContain('council');
    expect(skillFile!.content).toContain(SPEC.version);
  });

  test('generates agent files for each council agent', () => {
    const renderer = new AgyAgentContractRenderer();
    const contract = createContract(['agy']);
    const result = renderer.render(contract);

    const agentFiles = result.files.filter((f) => f.path.includes('/agents/'));
    expect(agentFiles.length).toBe(SPEC.agents.length);
  });

  test('generates workflow file', () => {
    const renderer = new AgyAgentContractRenderer();
    const contract = createContract(['agy']);
    const result = renderer.render(contract);

    const workflowFile = result.files.find((f) => f.path.includes('/workflows/'));
    expect(workflowFile).toBeDefined();
  });

  test('fails when contract does not include agy target', () => {
    const renderer = new AgyAgentContractRenderer();
    const contract = createContract(['claude']);
    const result = renderer.render(contract);

    expect(result.allValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.files).toHaveLength(0);
  });

  test('fails validation when CouncilSpec has no agents', () => {
    const renderer = new AgyAgentContractRenderer();
    const contract: AgentContract = {
      council: { name: '', version: '', description: '', outputContract: '', agents: [] } as CouncilSpec,
      targets: [{ target: 'agy' }],
      contractVersion: '1.0.0',
    };
    const result = renderer.render(contract);
    expect(result.allValid).toBe(false);
    expect(result.errors.some((e) => e.includes('agent file'))).toBe(true);
  });
});

// ─── Multi-target: all four providers ──────────────────────────────────────────

describe('single contract → all four providers', () => {
  test('renders correctly for Claude, OpenCode, Codex, and Agy from one AgentContract', () => {
    const contract = createContract(['claude', 'opencode', 'codex', 'agy']);

    const claudeResult = new ClaudeAgentContractRenderer().render(contract);
    const opencodeResult = new OpenCodeAgentContractRenderer().render(contract);
    const codexResult = new CodexAgentContractRenderer().render(contract);
    const agyResult = new AgyAgentContractRenderer().render(contract);

    expect(claudeResult.allValid).toBe(true);
    expect(opencodeResult.allValid).toBe(true);
    expect(codexResult.allValid).toBe(true);
    expect(agyResult.allValid).toBe(true);

    expect(claudeResult.target).toBe('claude');
    expect(opencodeResult.target).toBe('opencode');
    expect(codexResult.target).toBe('codex');
    expect(agyResult.target).toBe('agy');

    for (const file of claudeResult.files) {
      expect(file.path).toMatch(/^\.claude\//);
    }
    for (const file of opencodeResult.files) {
      expect(file.path).toMatch(/^\.opencode\//);
    }
    for (const file of codexResult.files) {
      expect(file.path).toMatch(/^\.codex\//);
    }
    for (const file of agyResult.files) {
      expect(file.path).toMatch(/^\.agents\//);
    }
  });
});

// ─── Codex / Agy provider-specific patterns (Phase 1 AC1) ──────────────────────

describe('Codex renderer — provider-specific path patterns', () => {
  test('Codex agent files follow .codex/agents/council_*.toml pattern', () => {
    const renderer = new CodexAgentContractRenderer();
    const result = renderer.render(createContract(['codex']));

    const agentFiles = result.files.filter((f) => f.path.includes('/agents/'));
    for (const file of agentFiles) {
      expect(file.path).toMatch(/^\.codex\/agents\/council_.+\.toml$/);
    }
  });

  test('Codex config file lives at .codex/config.toml and is TOML', () => {
    const renderer = new CodexAgentContractRenderer();
    const result = renderer.render(createContract(['codex']));

    const configFile = result.files.find((f) => f.path === '.codex/config.toml');
    expect(configFile).toBeDefined();
    expect(configFile!.content).toContain('[project]');
    expect(configFile!.content).toMatch(/^\[agents\./m);
  });

  test('Codex skill file lives at .codex/skills/council/SKILL.md', () => {
    const renderer = new CodexAgentContractRenderer();
    const result = renderer.render(createContract(['codex']));

    const skillFile = result.files.find((f) => f.path === '.codex/skills/council/SKILL.md');
    expect(skillFile).toBeDefined();
  });

  test('Codex: invalid CouncilSpec yields allValid=false with descriptive error', () => {
    const renderer = new CodexAgentContractRenderer();
    const contract: AgentContract = {
      council: {
        name: 'broken',
        version: '1.0.0',
        description: 'broken',
        outputContract: 'structured',
        agents: [
          {
            id: 'broken',
            role: 'Broken',
            // @ts-expect-error — invalid context to force schema failure
            context: 'superuser',
            modelHint: 'strong-reasoning',
            focus: [],
          },
        ],
      },
      targets: [{ target: 'codex' }],
      contractVersion: '1.0.0',
    };
    const result = renderer.render(contract);
    expect(result.allValid).toBe(false);
    expect(result.errors[0]).toContain('Invalid CouncilSpec');
    expect(result.files).toHaveLength(0);
  });

  test('Codex: contract survives JSON.stringify → JSON.parse and renders identically', () => {
    const renderer = new CodexAgentContractRenderer();
    const original = createContract(['codex']);

    const json = JSON.stringify(original);
    const restored: AgentContract = JSON.parse(json);

    const originalResult = renderer.render(original);
    const restoredResult = renderer.render(restored);

    expect(restoredResult.allValid).toBe(true);
    expect(restoredResult.errors).toEqual(originalResult.errors);
    expect(restoredResult.files.length).toBe(originalResult.files.length);

    for (let i = 0; i < restoredResult.files.length; i++) {
      expect(restoredResult.files[i]!.path).toBe(originalResult.files[i]!.path);
      expect(restoredResult.files[i]!.content).toBe(originalResult.files[i]!.content);
    }
  });

  test('Codex: contract with renderHints still renders valid output', () => {
    const renderer = new CodexAgentContractRenderer();
    const contract: AgentContract = {
      council: SPEC,
      targets: [{ target: 'codex' }],
      contractVersion: '1.0.0',
      renderHints: { codex: { locale: 'es' } },
    };
    const result = renderer.render(contract);
    expect(result.allValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.files.length).toBeGreaterThan(0);
  });
});

describe('Agy renderer — provider-specific path patterns', () => {
  test('Agy agent files follow .agents/agents/council-*.md pattern', () => {
    const renderer = new AgyAgentContractRenderer();
    const result = renderer.render(createContract(['agy']));

    const agentFiles = result.files.filter((f) => f.path.includes('/agents/'));
    for (const file of agentFiles) {
      expect(file.path).toMatch(/^\.agents\/agents\/council-.+\.md$/);
    }
  });

  test('Agy skill file lives at .agents/skills/council/SKILL.md', () => {
    const renderer = new AgyAgentContractRenderer();
    const result = renderer.render(createContract(['agy']));

    const skillFile = result.files.find((f) => f.path === '.agents/skills/council/SKILL.md');
    expect(skillFile).toBeDefined();
  });

  test('Agy workflow file lives at .agents/workflows/cc-council.md', () => {
    const renderer = new AgyAgentContractRenderer();
    const result = renderer.render(createContract(['agy']));

    const workflowFile = result.files.find((f) => f.path === '.agents/workflows/cc-council.md');
    expect(workflowFile).toBeDefined();
    expect(workflowFile!.content).toContain('Council-Driven Workflow');
  });

  test('Agy: invalid CouncilSpec yields allValid=false with descriptive error', () => {
    const renderer = new AgyAgentContractRenderer();
    const contract: AgentContract = {
      council: {
        name: 'broken',
        version: '1.0.0',
        description: 'broken',
        outputContract: 'structured',
        agents: [
          {
            id: 'broken',
            role: 'Broken',
            context: 'repo-readonly',
            // @ts-expect-error — invalid modelHint to force schema failure
            modelHint: 'super-duper',
            focus: [],
          },
        ],
      },
      targets: [{ target: 'agy' }],
      contractVersion: '1.0.0',
    };
    const result = renderer.render(contract);
    expect(result.allValid).toBe(false);
    expect(result.errors[0]).toContain('Invalid CouncilSpec');
    expect(result.files).toHaveLength(0);
  });

  test('Agy: contract survives JSON.stringify → JSON.parse and renders identically', () => {
    const renderer = new AgyAgentContractRenderer();
    const original = createContract(['agy']);

    const json = JSON.stringify(original);
    const restored: AgentContract = JSON.parse(json);

    const originalResult = renderer.render(original);
    const restoredResult = renderer.render(restored);

    expect(restoredResult.allValid).toBe(true);
    expect(restoredResult.errors).toEqual(originalResult.errors);
    expect(restoredResult.files.length).toBe(originalResult.files.length);

    for (let i = 0; i < restoredResult.files.length; i++) {
      expect(restoredResult.files[i]!.path).toBe(originalResult.files[i]!.path);
      expect(restoredResult.files[i]!.content).toBe(originalResult.files[i]!.content);
    }
  });

  test('Agy: contract with renderHints still renders valid output', () => {
    const renderer = new AgyAgentContractRenderer();
    const contract: AgentContract = {
      council: SPEC,
      targets: [{ target: 'agy' }],
      contractVersion: '1.0.0',
      renderHints: { agy: { overwrite: true } },
    };
    const result = renderer.render(contract);
    expect(result.allValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.files.length).toBeGreaterThan(0);
  });
});

// ─── Renderer directive matrix (Phase 1 AC1) ──────────────────────────────────

describe('Phase 1 AC1 — renderer directive matrix compiles for all four presets', () => {
  test('every preset renderer produces a non-empty file list when its target is in the contract', () => {
    const renderers = [
      { name: 'claude',   renderer: new ClaudeAgentContractRenderer(),  target: 'claude'   as const, expectedRoot: '.claude/'   },
      { name: 'opencode', renderer: new OpenCodeAgentContractRenderer(), target: 'opencode' as const, expectedRoot: '.opencode/' },
      { name: 'codex',    renderer: new CodexAgentContractRenderer(),    target: 'codex'    as const, expectedRoot: '.codex/'    },
      { name: 'agy',      renderer: new AgyAgentContractRenderer(),      target: 'agy'      as const, expectedRoot: '.agents/'   },
    ];

    for (const { name, renderer, target, expectedRoot } of renderers) {
      const contract = createContract([target]);
      const result = renderer.render(contract);

      expect(result.allValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.files.length).toBeGreaterThan(0);

      // Every file must live under the expected root for this preset
      for (const file of result.files) {
        expect(file.path.startsWith(expectedRoot)).toBe(true);
      }

      // Every preset must include at least one agent file
      const hasAgent = result.files.some((f) => f.path.includes('/agents/'));
      expect(hasAgent).toBe(true);
    }
  });

  test('every preset renderer reports the correct target identifier', () => {
    expect(new ClaudeAgentContractRenderer().target).toBe('claude');
    expect(new OpenCodeAgentContractRenderer().target).toBe('opencode');
    expect(new CodexAgentContractRenderer().target).toBe('codex');
    expect(new AgyAgentContractRenderer().target).toBe('agy');
  });
});
