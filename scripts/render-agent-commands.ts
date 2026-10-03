#!/usr/bin/env bun
/**
 * Render Cursor markdown workflows into Gemini TOML and Codex skills.
 * Source of truth: presets/cursor/commands/cc/*.md
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { WORKFLOW_COMMANDS } from '../src/core/presets/workflow-commands';
import { formatCcCommand } from '../src/core/presets/command-invocation';
import { validateWorkflowProfile } from '../src/validation/schemas';

const ROOT = join(import.meta.dir, '..');

const COUNCIL_CANONICAL = 'presets/agy/workflows/cc-council.md';
const COUNCIL_FALLBACK_YAML = 'src/core/ccep/workflows/council.yml';
const COUNCIL_FALLBACK_GENERATED = 'src/core/ccep/council-fallback.generated.ts';

/** Full manual Step-0 body marker: present in a full copy, absent in a redirect stub. */
const COUNCIL_FULL_BODY_MARKER = 'ccep compile --command council --phase';

const COUNCIL_REDIRECT_BANNER = `<!-- GENERATED redirect to ${COUNCIL_CANONICAL} by scripts/render-agent-commands.ts — DO NOT EDIT. -->`;

const COUNCIL_REDIRECT_POINTER = `command: council. Read \`${COUNCIL_CANONICAL}\`, then \`ccep profile council\` + \`ccep compile --command council --view prompt\`.`;

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

/**
 * The cursor source recommends other commands inline — "the next `/cc:x`
 * command", "Delegates to `/cc:tdd-cycle`" — always in cursor's own colon
 * spelling, copied verbatim. That spelling doesn't exist on Codex; rewrite
 * every backtick-wrapped `/cc:<name>` (including the bare `/cc:` form) to
 * the $cc- spelling actually used on this runner.
 */
export function rewriteCodexCrossReferences(body: string): string {
  return body.replace(/`\/cc:([a-z0-9-]*)`/g, (_match, name: string) => `\`$cc-${name}\``);
}

/**
 * Cursor's source invokes a role with "Invoke the `X` subagent via the Task
 * tool" — accurate on Cursor and Claude Code, both of which have a Task
 * tool. Gemini CLI and Codex CLI don't (see src/presets/targets/*.yml); left
 * as-is, both derived targets tell the model to use a tool that does not
 * exist for them. Rewritten to the same "adopt the role" phrasing Claude's
 * own hand-authored commands already use for the same reason, pointed at
 * each target's own role-definition file.
 */
export function rewriteTaskToolInvocation(body: string, target: 'gemini' | 'codex'): string {
  const roleDefinition = (role: string): string =>
    target === 'gemini' ? `\`.gemini/agents/${role}.md\`` : '`AGENTS.md`';

  return body
    .replace(
      /([Ii])nvoke the `([a-z-]+)` subagent via the Task tool/g,
      (_match, leadingCase: string, role: string) => {
        const verb = leadingCase === 'I' ? 'Adopt' : 'adopt';
        return `${verb} the \`${role}\` role as defined in ${roleDefinition(role)}`;
      }
    )
    .replace(
      /([Ii])nvoke `([a-z-]+)` then `([a-z-]+)` via the Task tool/g,
      (_match, leadingCase: string, role1: string, role2: string) => {
        const verb = leadingCase === 'I' ? 'Adopt' : 'adopt';
        return `${verb} the \`${role1}\` role as defined in ${roleDefinition(role1)}, then the \`${role2}\` role as defined in ${roleDefinition(role2)}`;
      }
    );
}

/**
 * Cursor's source points at its own skill install path — `.cursor/skills/`.
 * Gemini and Codex install skills under their own target-specific paths (see
 * src/presets/targets/*.yml); left as-is, both derived targets tell the
 * model to read skills from a directory that doesn't exist for them.
 */
export function rewriteSkillsPath(body: string, target: 'gemini' | 'codex'): string {
  const dest = target === 'gemini' ? '.gemini/skills/' : '.codex/skills/';
  return body.replaceAll('.cursor/skills/', dest);
}

export function renderGeminiToml(cmd: string, md: string): string {
  const description = descriptionFrom(md, cmd);
  const body = rewriteSkillsPath(rewriteTaskToolInvocation(bodyFrom(md), 'gemini'), 'gemini');
  const prompt = tomlEscapePrompt(body.replaceAll('$ARGUMENTS', '{{args}}'));
  return `description = ${JSON.stringify(description)}

prompt = """
${prompt}
"""
`;
}

export function renderCodexSkill(cmd: string, md: string): string {
  const description = descriptionFrom(md, cmd);
  const invoke = formatCcCommand(cmd, 'dollar');
  const body = rewriteSkillsPath(
    rewriteTaskToolInvocation(rewriteCodexCrossReferences(bodyFrom(md)), 'codex'),
    'codex',
  );
  const contextBudget = cmd === 'openspec'
    ? `## Model and context budget

Use GPT-6.1 Sol with medium reasoning effort for every OpenSpec phase. Pass each
role only its current TaskCard, relevant file paths, acceptance criteria, and a
short handoff. Avoid replaying the full transcript or re-reading large files.

`
    : cmd === 'council'
      ? `## Council context budget

Use GPT-6.1 Sol with medium reasoning effort. Give each necessary council role
the same short evidence summary and relevant diff. Reuse those findings in the
verdict; avoid spawning roles for questions already answered by evidence.

`
      : '';
  return `---
name: cc-${cmd}
description: ${description}
---

# ${cmd}

Invoke as \`${invoke}\`. The user request follows the skill mention.

${contextBudget}${body}
`;
}

/**
 * D3 redirect mode: once inject has reduced the cursor council source to a
 * redirect stub, gemini/codex render a redirect in their own format instead
 * of expanding a full copy. The redirect body carries no Task-tool
 * invocations, skills paths, or cross-references, so the per-target rewrites
 * below are no-ops by construction — kept in the pipeline so the redirect
 * can never leak another runner's spelling. The council context-budget block
 * is intentionally dropped: it alone would push the stub past 400 bytes.
 */
export function isCouncilRedirectSource(cmd: string, md: string): boolean {
  return cmd === 'council' && md.includes(COUNCIL_CANONICAL) && !md.includes(COUNCIL_FULL_BODY_MARKER);
}

export function renderGeminiRedirect(cmd: string, md: string): string {
  const description = descriptionFrom(md, cmd);
  const raw = `${COUNCIL_REDIRECT_BANNER}\n\n## Step 0 — CCEP Bootstrap\n\n${COUNCIL_REDIRECT_POINTER}`;
  const body = rewriteSkillsPath(rewriteTaskToolInvocation(raw, 'gemini'), 'gemini');
  const prompt = tomlEscapePrompt(body.replaceAll('$ARGUMENTS', '{{args}}'));
  return `description = ${JSON.stringify(description)}\n\nprompt = """\n${prompt}\n"""\n`;
}

export function renderCodexRedirect(cmd: string, md: string): string {
  const description = descriptionFrom(md, cmd);
  const raw = `${COUNCIL_REDIRECT_BANNER}\n\n## Step 0 — CCEP Bootstrap\n\n${COUNCIL_REDIRECT_POINTER}`;
  const body = rewriteSkillsPath(
    rewriteTaskToolInvocation(rewriteCodexCrossReferences(raw), 'codex'),
    'codex',
  );
  return `---\nname: cc-${cmd}\ndescription: ${description}\n---\n\n${body}\n`;
}

function writeGemini(cmd: string, md: string): void {
  const dest = join(ROOT, 'presets/gemini/commands/cc', `${cmd}.toml`);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, isCouncilRedirectSource(cmd, md) ? renderGeminiRedirect(cmd, md) : renderGeminiToml(cmd, md));
}

function writeCodex(cmd: string, md: string): void {
  const dest = join(ROOT, 'presets/codex/skills', `cc-${cmd}`, 'SKILL.md');
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, isCouncilRedirectSource(cmd, md) ? renderCodexRedirect(cmd, md) : renderCodexSkill(cmd, md));
}

/**
 * Q3: the council fallback profile is generated from the canonical
 * `council.yml` on every render pass — never hand-synced. The emitted
 * artifact is the validated profile, so it always deep-equals
 * `validateWorkflowProfile(parseYaml(council.yml))`.
 */
export function renderCouncilFallback(): string {
  const raw = readFileSync(join(ROOT, COUNCIL_FALLBACK_YAML), 'utf-8');
  const profile = validateWorkflowProfile(parseYaml(raw));
  return `/**\n * GENERATED from ${COUNCIL_FALLBACK_YAML} by scripts/render-agent-commands.ts — DO NOT EDIT.\n *\n * Q3 mirror of the canonical council workflow: the packaged bundle does not\n * ship the YAML asset, so profiles.ts falls back to this copy when the file\n * is absent. Regenerated by renderAll() and covered by check:drift.\n */\nimport type { WorkflowProfileInput } from '../../validation/schemas';\n\nexport const COUNCIL_FALLBACK_PROFILE: WorkflowProfileInput = ${JSON.stringify(profile, null, 2)};\n`;
}

export function writeCouncilFallback(): void {
  const dest = join(ROOT, COUNCIL_FALLBACK_GENERATED);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, renderCouncilFallback());
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
  writeCouncilFallback();
  return rendered;
}

if (import.meta.main) {
  const rendered = renderAll();
  console.log(`Rendered Gemini TOML + Codex skills for ${rendered} workflow(s)`);
}
