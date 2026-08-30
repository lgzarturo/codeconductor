#!/usr/bin/env bun
/**
 * Render Cursor markdown workflows into Gemini TOML and Codex skills.
 * Source of truth: presets/cursor/commands/cc/*.md
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { WORKFLOW_COMMANDS } from '../src/core/presets/workflow-commands';
import { formatCcCommand } from '../src/core/presets/command-invocation';

const ROOT = join(import.meta.dir, '..');

function descriptionFrom(md: string, cmd: string): string {
  const fm = md.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return `CodeConductor ${cmd} workflow`;
  const raw = fm[1]
    .replace(/^description:\s*>-?\s*\n?/, '')
    .replace(/^description:\s*/, '');
  const folded = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('['))
    .join(' ')
    .replace(/^\[cc: alias\]\s*/i, '')
    .trim();
  return folded || `CodeConductor ${cmd} workflow`;
}

function bodyFrom(md: string): string {
  return md.replace(/^---\n[\s\S]*?\n---\n*/, '').trim();
}

function tomlEscapePrompt(prompt: string): string {
  return prompt.replace(/\\/g, '\\\\').replace(/"""/g, "'''");
}

function writeGemini(cmd: string, md: string): void {
  const dest = join(ROOT, 'presets/gemini/commands/cc', `${cmd}.toml`);
  mkdirSync(dirname(dest), { recursive: true });
  const description = descriptionFrom(md, cmd);
  const prompt = tomlEscapePrompt(bodyFrom(md).replaceAll('$ARGUMENTS', '{{args}}'));
  const toml = `description = ${JSON.stringify(description)}

prompt = """
${prompt}
"""
`;
  writeFileSync(dest, toml);
}

function writeCodex(cmd: string, md: string): void {
  const dest = join(ROOT, 'presets/codex/skills', `cc-${cmd}`, 'SKILL.md');
  mkdirSync(dirname(dest), { recursive: true });
  const description = descriptionFrom(md, cmd);
  const invoke = formatCcCommand(cmd, 'dollar');
  const body = bodyFrom(md);
  const skill = `---
name: cc-${cmd}
description: ${description}
---

# ${cmd}

Invoke as \`${invoke}\`. The user request follows the skill mention.

${body}
`;
  writeFileSync(dest, skill);
}

let rendered = 0;
for (const cmd of WORKFLOW_COMMANDS) {
  const src = join(ROOT, 'presets/cursor/commands/cc', `${cmd}.md`);
  if (!existsSync(src)) {
    console.warn('skip missing source', src);
    continue;
  }
  const md = readFileSync(src, 'utf-8');
  writeGemini(cmd, md);
  writeCodex(cmd, md);
  rendered++;
}

console.log(`Rendered Gemini TOML + Codex skills for ${rendered} workflow(s)`);
