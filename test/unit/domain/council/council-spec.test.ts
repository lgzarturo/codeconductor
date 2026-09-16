import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  DEFAULT_COUNCIL_AGENTS,
  deriveConsensusConfig,
  hasSecurityFocusedAgent,
  selectCouncilPanel,
  SEO_HOTEL_COUNCIL_AGENTS,
  type CouncilSpec,
} from '../../../../src/domain/council/council-spec';
import { ConsensusConfigSchema, validateCouncilSpec } from '../../../../src/validation/schemas';

const YAML_PATH = join(import.meta.dir, '../../../../src/presets/council/council.yml');

function defaultSpec(): CouncilSpec {
  return {
    name: 'council',
    version: '0.1.0',
    description: 'Multi-agent council',
    outputContract: 'v1',
    agents: DEFAULT_COUNCIL_AGENTS,
  };
}

describe('deriveConsensusConfig', () => {
  test('uses roster ids and ceil(n/2) quorum from the spec', () => {
    const config = deriveConsensusConfig(defaultSpec());
    expect(config.algorithm).toBe('majority');
    expect(config.allowSecurityVeto).toBe(true);
    expect(config.expectedAgentIds).toEqual(DEFAULT_COUNCIL_AGENTS.map((a) => a.id));
    expect(config.quorum).toBe(Math.ceil(DEFAULT_COUNCIL_AGENTS.length / 2));
    expect(config.criticalFindingsPolicy).toBe('escalate');
  });

  test('throws when allowSecurityVeto is set without a security-focused agent', () => {
    const spec: CouncilSpec = {
      name: 'seo',
      version: '1',
      description: 'd',
      outputContract: 'v1',
      agents: SEO_HOTEL_COUNCIL_AGENTS,
    };
    expect(hasSecurityFocusedAgent(spec)).toBe(false);
    expect(() => deriveConsensusConfig(spec)).toThrow(/security-focused agent/);
    expect(deriveConsensusConfig(spec, { allowSecurityVeto: false }).allowSecurityVeto).toBe(false);
  });

  test('derives a deterministic, proportional panel from type, risk and scope', () => {
    const first = selectCouncilPanel(defaultSpec(), {
      type: 'feature',
      risk: 'high',
      scope: ['src/auth/session.ts', 'src/data/migrations/001.sql'],
    });
    const second = selectCouncilPanel(defaultSpec(), {
      type: 'feature',
      risk: 'high',
      scope: ['src/auth/session.ts', 'src/data/migrations/001.sql'],
    });

    expect(first.expectedAgentIds).toEqual(second.expectedAgentIds);
    expect(first.expectedAgentIds).toEqual([
      'architect',
      'product',
      'delivery',
      'data-ops',
      'security-reviewer',
      'devil',
    ]);
    expect(first.quorum).toBe(3);
  });

  test('includes the security reviewer when a security signal is present', () => {
    const panel = selectCouncilPanel(defaultSpec(), {
      type: 'fix',
      risk: 'low',
      scope: ['src/auth/token.ts'],
    });
    expect(panel.expectedAgentIds).toEqual(['delivery', 'security-reviewer', 'devil']);
    expect(panel.quorum).toBe(2);
    expect(panel.allowSecurityVeto).toBe(true);
  });

  test('keeps the security veto valid for a routine low-risk panel', () => {
    const panel = selectCouncilPanel(defaultSpec(), {
      type: 'fix',
      risk: 'low',
      scope: ['src/formatting.ts'],
    });
    expect(panel.expectedAgentIds).toEqual(['delivery', 'security-reviewer', 'devil']);
    expect(ConsensusConfigSchema.safeParse(panel).success).toBe(true);
  });
});

describe('DEFAULT_COUNCIL_AGENTS vs presets/council/council.yml', () => {
  test('YAML agent ids and focus match the TypeScript roster', () => {
    const parsed = parseYaml(readFileSync(YAML_PATH, 'utf-8')) as {
      agents: Array<{ id: string; role: string; focus: string[] }>;
    };
    const yamlSpec = validateCouncilSpec(parseYaml(readFileSync(YAML_PATH, 'utf-8')));
    expect(yamlSpec.agents.map((a) => a.id)).toEqual(DEFAULT_COUNCIL_AGENTS.map((a) => a.id));
    expect(parsed.agents.map((a) => a.focus)).toEqual(
      DEFAULT_COUNCIL_AGENTS.map((a) => [...a.focus]),
    );
    expect(yamlSpec.agents.some((a) => a.id === 'security-reviewer')).toBe(true);
  });
});
