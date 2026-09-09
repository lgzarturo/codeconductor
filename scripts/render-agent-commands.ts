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

export function descriptionFrom(md: string, cmd: string): string {
  const fm = md.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return `CodeConductor ${cmd} workflow`;
  const raw = fm[1]
    .replace(/^description:\s*>-?\s*\n?/, '')
    .replace(/^description:\s*/, '');
  // Fold the (possibly multi-line) YAML block first, THEN strip the leading
  // "[cc: alias]" marker — stripping per-line here would drop the marker's own
  // line (it starts with "[") before the marker text ever gets removed,
  // truncating the description down to whatever followed it.
  const folded = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(' ')
    .replace(/^\[cc: alias\]\s*/i, '')
    .trim();
  return folded || `CodeConductor ${cmd} workflow`;
}

export function bodyFrom(md: string): string {
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
  // The cursor source recommends other commands inline — "the next `/cc:x`
  // command", "Delegates to `/cc:tdd-cycle`" — always in cursor's own colon
  // spelling, copied verbatim. That spelling doesn't exist on Codex; rewrite
  // every backtick-wrapped `/cc:<name>` (including the bare `/cc:` form) to
  // the $cc- spelling actually used on this runner.
  const body = bodyFrom(md).replace(
    /`\/cc:([a-z0-9-]*)`/g,
    (_match, name: string) => `\`$cc-${name}\``
  );
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

/**
 * Read one Cursor source command and normalize it to LF. Exported so tests
 * can compute the expected description/body against the exact same source
 * bytes the real render pass uses, without re-running the write pass.
 *
 * presets/cursor/commands/cc/*.md are CRLF (Windows checkout), but
 * descriptionFrom/bodyFrom match the frontmatter fence on a literal '\n'.
 * Without this, the fence never matches, the description silently falls
 * back to the generic "CodeConductor <cmd> workflow", and bodyFrom leaves
 * the raw YAML frontmatter block sitting inside the rendered body instead
 * of stripping it.
 */
export function readNormalizedSource(cmd: string): string | undefined {
  const src = join(ROOT, 'presets/cursor/commands/cc', `${cmd}.md`);
  if (!existsSync(src)) return undefined;
  return readFileSync(src, 'utf-8').replace(/\r\n/g, '\n');
}

export function renderAll(): number {
  let rendered = 0;
  for (const cmd of WORKFLOW_COMMANDS) {
    const md = readNormalizedSource(cmd);
    if (md === undefined) {
      console.warn('skip missing source', join(ROOT, 'presets/cursor/commands/cc', `${cmd}.md`));
      continue;
    }
    writeGemini(cmd, md);
    writeCodex(cmd, md);
    rendered++;
  }
  return rendered;
}

if (import.meta.main) {
  const rendered = renderAll();
  console.log(`Rendered Gemini TOML + Codex skills for ${rendered} workflow(s)`);
}
