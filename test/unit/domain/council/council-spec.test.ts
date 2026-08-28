import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  DEFAULT_COUNCIL_AGENTS,
  deriveConsensusConfig,
  hasSecurityFocusedAgent,
  SEO_HOTEL_COUNCIL_AGENTS,
  type CouncilSpec,
} from '../../../../src/domain/council/council-spec';
import { validateCouncilSpec } from '../../../../src/validation/schemas';

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
