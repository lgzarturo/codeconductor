import type { GeneratedFile } from '../../core/generation/generated-file';
import { generateAgentContent } from '../../domain/council/council-agent';
import type { CouncilSpec } from '../../domain/council/council-spec';

/**
 * Generate OpenCode council files
 */
export function generateOpenCodeFiles(spec: CouncilSpec): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  // Generate council command
  files.push({
    path: '.opencode/commands/cc-council.md',
    content: generateCouncilCommand(spec),
    overwrite: false,
  });

  // Generate council lead agent
  files.push({
    path: '.opencode/agents/council-lead.md',
    content: generateCouncilLead(spec),
    overwrite: false,
  });

  // Generate individual agents
  for (const agent of spec.agents) {
    files.push({
      path: `.opencode/agents/council-${agent.id}.md`,
      content: generateOpenCodeAgentContent(agent),
      overwrite: false,
    });
  }

  return files;
}

function generateCouncilCommand(spec: CouncilSpec): string {
  return `---
description: ${yamlString(spec.description)}
agent: council-lead
subtask: true
---

Run the CodeConductor council for multi-perspective analysis.

## Version
${spec.version}

## Agents
${spec.agents.map((a) => `- ${a.role} (${a.id})`).join('\n')}

## Instructions
Coordinate with the council agents and synthesize their perspectives into the configured output contract.
`;
}

function generateCouncilLead(spec: CouncilSpec): string {
  return `---
description: ${yamlString(`${spec.description} Council lead. Coordinates council members and synthesizes recommendations.`)}
mode: subagent
permission:
  read: allow
  edit: deny
  bash: deny
  glob: allow
  grep: allow
  webfetch: deny
  websearch: deny
---

# Council Lead Agent

## Role
Coordinates the council and synthesizes perspectives

## Version
${spec.version}

## Council Members
${spec.agents.map((a) => `- ${a.role}: ${a.focus.join(', ')}`).join('\n')}

## Responsibilities
- Coordinate agent responses
- Synthesize different perspectives
- Identify consensus and disagreements
- Provide final recommendation
`;
}

function generateOpenCodeAgentContent(agent: CouncilSpec['agents'][number]): string {
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
