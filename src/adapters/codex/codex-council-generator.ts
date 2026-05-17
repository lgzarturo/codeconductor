import type { GeneratedFile } from '../../core/generation/generated-file'
import type { CouncilSpec } from '../../domain/council/council-spec'

/**
 * Generate Codex council files
 */
export function generateCodexFiles(spec: CouncilSpec): GeneratedFile[] {
  const files: GeneratedFile[] = []

  // Generate config
  files.push({
    path: '.codex/config.toml',
    content: generateCodexConfig(spec),
    overwrite: false
  })

  // Generate agents as TOML
  for (const agent of spec.agents) {
    files.push({
      path: `.codex/agents/council_${agent.id}.toml`,
      content: generateCodexAgent(agent),
      overwrite: true
    })
  }

  // Generate skills
  files.push({
    path: '.codex/skills/council/SKILL.md',
    content: generateCodexSkill(spec),
    overwrite: true
  })

  return files
}

function generateCodexConfig(spec: CouncilSpec): string {
  return `# Codex Council Configuration

[project]
name = "council"
version = "${spec.version}"

[agents]
enabled = true

[agents.council]
description = "${spec.description}"
agents = [${spec.agents.map(a => `"${a.id}"`).join(', ')}]
`
}

function generateCodexAgent(agent: { id: string; role: string; context: string; modelHint: string; focus: readonly string[] }): string {
  const focusAreas = agent.focus.join(', ')
  return `description = "${agent.role} council agent. Focus: ${focusAreas}. Context: ${agent.context}. Model hint: ${agent.modelHint}."
nickname_candidates = ["${agent.role}", "Council ${agent.role}"]
`
}

function generateCodexSkill(spec: CouncilSpec): string {
  return `---
name: council
description: ${spec.description}
version: ${spec.version}
---

## Agents
${spec.agents.map(a => `- **${a.role}** (${a.id}): ${a.focus.join(', ')}`).join('\n')}

## Usage
Use the council agents to get multi-perspective analysis on code changes, architecture decisions, and security reviews.
`
}