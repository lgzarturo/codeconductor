import type { GeneratedFile } from '../../core/generation/generated-file'
import type { CouncilSpec } from '../../domain/council/council-spec'
import { generateAgentContent } from '../../domain/council/council-agent'

/**
 * Generate Claude council files
 */
export function generateClaudeFiles(spec: CouncilSpec): GeneratedFile[] {
  const files: GeneratedFile[] = []

  // Generate council skill
  files.push({
    path: '.claude/skills/council/SKILL.md',
    content: generateCouncilSkill(spec),
    overwrite: false
  })

  // Generate individual agents
  for (const agent of spec.agents) {
    files.push({
      path: `.claude/agents/council-${agent.id}.md`,
      content: generateAgentContent(agent),
      overwrite: false
    })
  }

  return files
}

function generateCouncilSkill(spec: CouncilSpec): string {
  return `# Council Skill

## Description
${spec.description}

## Version
${spec.version}

## Agents
${spec.agents.map(a => `- **${a.role}** (${a.id}): ${a.focus.join(', ')}`).join('\n')}

## Usage
Use the council agents to get multi-perspective analysis on code changes, architecture decisions, and security reviews.

## Context
${spec.outputContract}
`
}