import type { GeneratedFile } from '../../core/generation/generated-file';
import { generateAgentContent } from '../../domain/council/council-agent';
import type { CouncilSpec } from '../../domain/council/council-spec';

/**
 * Generate Antigravity (agy) council files
 */
export function generateAgyFiles(spec: CouncilSpec): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  // Generate council skill
  files.push({
    path: '.agents/skills/council/SKILL.md',
    content: generateCouncilSkill(spec),
    overwrite: false,
  });

  // Generate individual agents
  for (const agent of spec.agents) {
    files.push({
      path: `.agents/agents/council-${agent.id}.md`,
      content: generateAgyAgentContent(agent),
      overwrite: false,
    });
  }

  return files;
}

function generateCouncilSkill(spec: CouncilSpec): string {
  return `---
name: council
description: ${yamlString(spec.description)}
---

# Council Skill

## Version
${spec.version}

## Agents
${spec.agents.map((a) => `- ${a.role} (${a.id}): ${a.focus.join(', ')}`).join('\n')}

## Usage
Use the council agents to get multi-perspective analysis on code changes, architecture decisions, and security reviews.

## Instructions
Coordinate with the council agents and synthesize their perspectives into the configured output contract.

## Context
${spec.outputContract}
`;
}

function generateAgyAgentContent(agent: CouncilSpec['agents'][number]): string {
  return `---
description: ${yamlString(`${agent.role} council agent. Focus: ${agent.focus.join(', ')}. Context: ${agent.context}. Model hint: ${agent.modelHint}.`)}
mode: subagent
permission:
${generatePermissionBlock(agent.context)}
---

${generateAgentContent(agent)}`;
}

function generatePermissionBlock(context: CouncilSpec['agents'][number]['context']): string {
  if (context === 'repo-readonly') {
    return `  read: allow
  edit: deny
  bash: deny
  glob: allow
  grep: allow
  webfetch: deny
  websearch: deny`;
  }

  return `  read: deny
  edit: deny
  bash: deny
  glob: deny
  grep: deny
  webfetch: deny
  websearch: deny`;
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}
