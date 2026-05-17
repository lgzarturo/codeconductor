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
      overwrite: false
    })
  }

  // Generate skills
  files.push({
    path: '.agents/skills/council/SKILL.md',
    content: generateCodexSkill(spec),
    overwrite: false
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
  return `# Council ${agent.role} Agent

name = "council_${agent.id}"
role = "${agent.role}"
context = "${agent.context}"
model_hint = "${agent.modelHint}"

[agent.focus]
areas = [${agent.focus.map(f => `"${f}"`).join(', ')}]
`
}

function generateCodexSkill(spec: CouncilSpec): string {
  return `# Council Skill

## Description
${spec.description}

## Version
${spec.version}

## Agents
${spec.agents.map(a => `- **${a.role}** (${a.id}): ${a.focus.join(', ')}`).join('\n')}

## Usage
Use the council agents to get multi-perspective analysis on code changes, architecture decisions, and security reviews.
`
}