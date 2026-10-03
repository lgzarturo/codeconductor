#!/usr/bin/env bun
/**
 * Inject CCEP Bootstrap (Step 0) and OpenSpec quality gates into slash-command
 * presets across runners. Idempotent.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  SDD_DELIVERY_COMMANDS,
  SDD_GATE_HEADING,
  WORKFLOW_COMMANDS,
} from '../src/core/presets/workflow-commands';
import { formatCcCommand, type CommandSurface } from '../src/core/presets/command-invocation';

const ROOT = join(import.meta.dir, '..');

const RUNNER_PATHS: Array<{
  dir: string;
  resolve: (cmd: string) => string;
  surface: CommandSurface;
}> = [
  { dir: 'presets/cursor/commands/cc', resolve: (cmd) => `${cmd}.md`, surface: 'colon' },
  { dir: 'presets/claude/commands/cc', resolve: (cmd) => `${cmd}.md`, surface: 'colon' },
  { dir: 'presets/opencode/commands', resolve: (cmd) => `cc-${cmd}.md`, surface: 'hyphen' },
  {
    dir: 'presets/agy/workflows',
    resolve: (cmd) => (cmd === 'council' ? 'cc-council.md' : `cc-${cmd}.md`),
    surface: 'hyphen',
  },
];

const COMMANDS = WORKFLOW_COMMANDS;

const BOOTSTRAP_HEADING = '## Step 0 — CCEP Bootstrap';
const DELEGATE_LINE =
  '4. Pass each subagent only the compiled `prompt` for its phase — never forward raw `$ARGUMENTS` to planners.';

/**
 * Workflows that carry both a test and an implementation phase. Only these get
 * the delivery-order line: on a review or a pagespeed report there is nothing to
 * order, and the guidance reads as an instruction to produce work that was never
 * asked for.
 */
const TDD_COMMANDS = new Set([
  'feature',
  'fix',
  'tdd-cycle',
  'spec-mutation',
  'db-migration',
  'openspec',
  'iterative',
  'security',
]);

function bootstrap(cmd: string): string {
  const councilLine = cmd === 'council' ? '\ncommand: council' : '';
  const orderLine = TDD_COMMANDS.has(cmd)
    ? '\n   Canonical delivery order is test-before-implement whenever both phases apply.'
    : '';
  return `## Step 0 — CCEP Bootstrap

Command: \`${cmd}\` (fixed for this workflow — do not infer from user text)${councilLine}

1. Run: \`npx cc-codeconductor ccep profile ${cmd} --output json\` to get the phases and their roles.
2. For each delegated phase, run: \`npx cc-codeconductor ccep compile --command ${cmd} --phase <phase-id> "$ARGUMENTS" --view prompt --output json\`
3. After planner/intake JSON is available, run: \`npx cc-codeconductor ccep evaluate --command ${cmd} --input <planner.json> --output json\`. If \`stop\` is true, show questions or risks and wait for human input.
${DELEGATE_LINE}${orderLine}

---

`;
}

function sddGates(cmd: string, invoke: string): string {
  return `${SDD_GATE_HEADING}

If \`openspec status\` reports an active change folder:

1. Run: \`npx cc-codeconductor openspec validate --output json\`
2. Run: \`npx cc-codeconductor openspec analyze --output json\`
3. If analyze \`stop\` is true or any finding is CRITICAL, stop. Do not delegate to implementer.
4. Next command spelling on this runner: \`${invoke}\`

Local development: \`bun run dev <same argv>\`. Published package: \`npx cc-codeconductor\`.

---

`;
}

function injectSddGates(content: string, cmd: string, invoke: string): string {
  if (!SDD_DELIVERY_COMMANDS.has(cmd as (typeof WORKFLOW_COMMANDS)[number])) {
    return content;
  }
  if (content.includes(SDD_GATE_HEADING)) {
    return content;
  }
  const block = sddGates(cmd, invoke);
  const idx = content.indexOf(DELEGATE_LINE);
  if (idx === -1) {
    return `${content.trimEnd()}\n\n${block}`;
  }
  const after = content.indexOf('\n---\n', idx);
  if (after === -1) {
    return `${content.trimEnd()}\n\n${block}`;
  }
  return `${content.slice(0, after + 5)}\n${block}${content.slice(after + 5)}`;
}

function injectBootstrap(content: string, cmd: string): string {
  const block = bootstrap(cmd);

  const start = content.indexOf(BOOTSTRAP_HEADING);
  if (start !== -1) {
    const end = content.indexOf('\n---\n\n', start);
    if (end === -1) return content;
    return content.slice(0, start) + block + content.slice(end + 6);
  }

  if (content.includes('## Before you begin — mandatory pre-check')) {
    return content.replace(
      '## Before you begin — mandatory pre-check',
      block + '## Before you begin — mandatory pre-check',
    );
  }

  if (content.includes('Produces a prioritized report in the current working directory.\n\n## Usage')) {
    return content.replace(
      'Produces a prioritized report in the current working directory.\n\n## Usage',
      `Produces a prioritized report in the current working directory.\n\n${block}## Usage`,
    );
  }

  if (content.includes('\n---\n\n## Step 1')) {
    return content.replace('\n---\n\n## Step 1', `\n---\n\n${block}## Step 1`);
  }

  if (content.includes('\n\n## Step 1')) {
    return content.replace('\n\n## Step 1', `\n\n${block}## Step 1`);
  }

  if (content.includes('\n\n## Step 0a — Validate')) {
    return content.replace('\n\n## Step 0a — Validate', `\n\n${block}## Step 0a — Validate`);
  }

  if (content.includes('Scope: $ARGUMENTS\n\n1.')) {
    return content.replace('Scope: $ARGUMENTS\n\n1.', `Scope: $ARGUMENTS\n\n${block}1.`);
  }

  return content;
}

const COUNCIL_CANONICAL = 'presets/agy/workflows/cc-council.md';

/**
 * D3 redirect mode: the non-canonical council copies are minimal stubs
 * (GENERATED banner + canonical pointer + compressed Step 0 entry line),
 * never full Steps bodies. Kept under 400 bytes so the 5 copies stop
 * duplicating ~19KB of identical prompt text.
 */
const COUNCIL_REDIRECT_BANNER = `<!-- GENERATED redirect to ${COUNCIL_CANONICAL} by scripts/inject-ccep-bootstrap.ts — DO NOT EDIT. -->`;

const COUNCIL_REDIRECT_POINTER = `command: council. Read \`${COUNCIL_CANONICAL}\`, then \`ccep profile council\` + \`ccep compile --command council --view prompt\`.`;

/**
 * Rewrite the backtick-wrapped `/cc:x` cross-references the template carries
 * in its own (hyphen) spelling to the target runner's native surface, so a
 * regenerated copy never leaks another runner's invocation spelling.
 */
function rewriteCouncilInvocation(body: string, surface: CommandSurface): string {
  if (surface === 'colon') {
    return body.replace(/`\/cc-([a-z0-9-]+)`/g, (_match, name: string) => `\`/cc:${name}\``);
  }
  return body.replace(/`\/cc:([a-z0-9-]+)`/g, (_match, name: string) => `\`/cc-${name}\``);
}

function councilRedirectStub(surface: CommandSurface): string {
  const body = `${COUNCIL_REDIRECT_BANNER}\n\n${BOOTSTRAP_HEADING}\n\n${COUNCIL_REDIRECT_POINTER}\n`;
  // The stub carries no invocation spellings, so the per-target rewrite is a
  // no-op by construction — kept in the pipeline so a future pointer that
  // names another command still renders in the runner's native surface.
  return `---\ndescription: Council-driven workflow with CCEP-1 bootstrap\n---\n\n${rewriteCouncilInvocation(body, surface)}`;
}

function writeCouncilPreset(targetPath: string, surface: CommandSurface): boolean {
  const wrapped = councilRedirectStub(surface);
  const before = existsSync(targetPath) ? readFileSync(targetPath, 'utf-8') : null;
  if (before === wrapped) return false;
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, wrapped);
  return true;
}

let updated = 0;
for (const runner of RUNNER_PATHS) {
  for (const cmd of COMMANDS) {
    const filePath = join(ROOT, runner.dir, runner.resolve(cmd));
    if (cmd === 'council' && runner.dir !== 'presets/agy/workflows') {
      // Council copies are redirect stubs pointing at the agy canonical
      // source — always re-render so they can never drift from it.
      if (writeCouncilPreset(filePath, runner.surface)) updated++;
      continue;
    }
    if (!existsSync(filePath)) {
      console.warn('skip missing', filePath);
      continue;
    }
    const before = readFileSync(filePath, 'utf-8');
    const after = injectSddGates(
      injectBootstrap(before, cmd),
      cmd,
      formatCcCommand(cmd, runner.surface),
    );
    if (after !== before) {
      writeFileSync(filePath, after);
      updated++;
    }
  }
}

console.log(`CCEP bootstrap: ${updated} file(s) updated`);

