import { describe, expect, test } from 'bun:test';
import { generateCodexFiles } from '../src/adapters/codex/codex-council-generator';
import type { CouncilSpec } from '../src/domain/council/council-spec';

const SPEC: CouncilSpec = {
  name: 'test-council',
  version: '1.0.0',
  description: 'Test council',
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
  ],
};

describe('generateCodexFiles', () => {
  test('agent TOML only contains valid Codex fields (no unknown fields)', () => {
    const files = generateCodexFiles(SPEC);
    const agentFiles = files.filter((f) => f.path.includes('/agents/'));

    for (const file of agentFiles) {
      expect(file.content).toContain('name =');
      expect(file.content).toContain('description =');
      expect(file.content).toContain('nickname_candidates =');
      expect(file.content).toContain('developer_instructions =');
      // These fields cause "unknown field" errors in Codex
      expect(file.content).not.toContain('role =');
      expect(file.content).not.toContain('model_hint =');
      expect(file.content).not.toContain('[agent.');
    }
  });

  test('agent TOML description includes role, focus, context and model hint', () => {
    const files = generateCodexFiles(SPEC);
    const architectFile = files.find((f) => f.path.includes('council_architect.toml'));

    expect(architectFile).toBeDefined();
    expect(architectFile!.content).toContain('Architect');
    expect(architectFile!.content).toContain('architecture');
    expect(architectFile!.content).toContain('repo-readonly');
    expect(architectFile!.content).toContain('strong-reasoning');
  });

  test('agent TOML developer_instructions includes role, focus and context', () => {
    const files = generateCodexFiles(SPEC);
    const architectFile = files.find((f) => f.path.includes('council_architect.toml'));

    expect(architectFile).toBeDefined();
    expect(architectFile!.content).toContain('developer_instructions =');
    expect(architectFile!.content).toContain('Architect');
    expect(architectFile!.content).toContain('architecture');
    expect(architectFile!.content).toContain('repo-readonly');
  });

  test('agent TOML name field matches agent role', () => {
    const files = generateCodexFiles(SPEC);
    const architectFile = files.find((f) => f.path.includes('council_architect.toml'));

    expect(architectFile).toBeDefined();
    expect(architectFile!.content).toContain('name = "Architect"');
  });

  test('SKILL.md has YAML frontmatter delimited by ---', () => {
    const files = generateCodexFiles(SPEC);
    const skillFile = files.find((f) => f.path.includes('SKILL.md'));

    expect(skillFile).toBeDefined();
    const lines = skillFile!.content.split('\n');
    expect(lines[0]).toBe('---');
    expect(skillFile!.content).toContain('name: council');
    expect(skillFile!.content).toContain('description:');
  });

  test('agent files have overwrite: true so reinstalls update existing files', () => {
    const files = generateCodexFiles(SPEC);
    const agentFiles = files.filter((f) => f.path.includes('/agents/'));
    const skillFile = files.find((f) => f.path.includes('SKILL.md'));

    for (const file of agentFiles) {
      expect(file.overwrite).toBe(true);
    }
    expect(skillFile!.overwrite).toBe(true);
  });

  test('generates one agent file per agent in spec', () => {
    const files = generateCodexFiles(SPEC);
    const agentFiles = files.filter((f) => f.path.includes('/agents/'));
    expect(agentFiles).toHaveLength(SPEC.agents.length);
  });

  test('config.toml does not contain boolean values under [agents]', () => {
    const files = generateCodexFiles(SPEC);
    const configFile = files.find((f) => f.path.endsWith('config.toml'));

    expect(configFile).toBeDefined();
    expect(configFile!.content).not.toContain('enabled = true');
    expect(configFile!.content).not.toContain('enabled = false');
  });

  test('config.toml defines each agent as a struct with description and nickname_candidates', () => {
    const files = generateCodexFiles(SPEC);
    const configFile = files.find((f) => f.path.endsWith('config.toml'));

    expect(configFile).toBeDefined();

    for (const agent of SPEC.agents) {
      expect(configFile!.content).toContain(`[agents.${agent.id}]`);
      expect(configFile!.content).toContain('description =');
      expect(configFile!.content).toContain('nickname_candidates =');
    }
  });

  test('config.toml does not contain [agents.council] sub-table', () => {
    const files = generateCodexFiles(SPEC);
    const configFile = files.find((f) => f.path.endsWith('config.toml'));

    expect(configFile).toBeDefined();
    expect(configFile!.content).not.toContain('[agents.council]');
    expect(configFile!.content).not.toContain('agents = [');
  });
});
