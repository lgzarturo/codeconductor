import { describe, expect, test } from 'bun:test';
import { generateOpenCodeFiles } from '../src/adapters/opencode/opencode-council-generator';
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
      id: 'product',
      role: 'Product',
      context: 'prompt-only',
      modelHint: 'balanced',
      focus: ['requirements', 'ux'],
    },
  ],
};

describe('generateOpenCodeFiles', () => {
  test('generates cc-council command with valid OpenCode command frontmatter', () => {
    const files = generateOpenCodeFiles(SPEC);
    const commandFile = files.find((f) => f.path === '.opencode/commands/cc-council.md');

    expect(commandFile).toBeDefined();
    expect(commandFile!.content.startsWith('---\n')).toBe(true);
    expect(commandFile!.content).toContain('description: "Test council"');
    expect(commandFile!.content).toContain('agent: council-lead');
    expect(commandFile!.content).toContain('subtask: true');
    expect(files.some((f) => f.path === '.opencode/commands/council.md')).toBe(false);
  });

  test('council lead is a valid OpenCode markdown subagent', () => {
    const files = generateOpenCodeFiles(SPEC);
    const leadFile = files.find((f) => f.path === '.opencode/agents/council-lead.md');

    expect(leadFile).toBeDefined();
    expect(leadFile!.content.startsWith('---\n')).toBe(true);
    expect(leadFile!.content).toContain('description:');
    expect(leadFile!.content).toContain('mode: subagent');
    expect(leadFile!.content).toContain('permission:');
    expect(leadFile!.content).not.toContain('tools:');
    expect(leadFile!.content).not.toContain('maxTurns:');
  });

  test('repo-readonly council agents allow reads but deny edits and bash', () => {
    const files = generateOpenCodeFiles(SPEC);
    const architectFile = files.find((f) => f.path === '.opencode/agents/council-architect.md');

    expect(architectFile).toBeDefined();
    expect(architectFile!.content).toContain('mode: subagent');
    expect(architectFile!.content).toContain('permission:');
    expect(architectFile!.content).toContain('  read: allow');
    expect(architectFile!.content).toContain('  edit: deny');
    expect(architectFile!.content).toContain('  bash: deny');
    expect(architectFile!.content).toContain('  glob: allow');
    expect(architectFile!.content).toContain('  grep: allow');
    expect(architectFile!.content).not.toContain('tools:');
  });

  test('prompt-only council agents deny repository access permissions', () => {
    const files = generateOpenCodeFiles(SPEC);
    const productFile = files.find((f) => f.path === '.opencode/agents/council-product.md');

    expect(productFile).toBeDefined();
    expect(productFile!.content).toContain('mode: subagent');
    expect(productFile!.content).toContain('  read: deny');
    expect(productFile!.content).toContain('  edit: deny');
    expect(productFile!.content).toContain('  bash: deny');
    expect(productFile!.content).toContain('  glob: deny');
    expect(productFile!.content).toContain('  grep: deny');
    expect(productFile!.content).not.toContain('tools:');
  });
});
