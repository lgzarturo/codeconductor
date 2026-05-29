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
    path: '.opencode/commands/council.md',
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
      content: generateAgentContent(agent),
      overwrite: false,
    });
  }

  return files;
}

function generateCouncilCommand(spec: CouncilSpec): string {
  return `# Council Command

## Description
${spec.description}

## Version
${spec.version}

## Agents
${spec.agents.map((a) => `- ${a.role} (${a.id})`).join('\n')}

## Usage
Invoke this command to get multi-perspective analysis from the council.
`;
}

function generateCouncilLead(spec: CouncilSpec): string {
  return `# Council Lead Agent

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
