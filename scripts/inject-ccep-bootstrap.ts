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
]);

function bootstrap(cmd: string): string {
  const councilLine = cmd === 'council' ? '\ncommand: council' : '';
  const orderLine = TDD_COMMANDS.has(cmd)
    ? '\n   Canonical delivery order is test-before-implement whenever both phases apply.'
    : '';
  return `## Step 0 — CCEP Bootstrap

Command: \`${cmd}\` (fixed for this workflow — do not infer from user text)${councilLine}

1. Run: \`npx cc-codeconductor ccep parse --command ${cmd} "$ARGUMENTS" --output json\`
2. Run: \`npx cc-codeconductor ccep resolve --command ${cmd} "$ARGUMENTS" --output json\`
3. Run: \`npx cc-codeconductor ccep profile ${cmd} --output json\`
4. After planner/intake JSON is available, run: \`npx cc-codeconductor ccep evaluate --command ${cmd} --input <planner.json> --output json\`. If \`stop\` is true, show questions or risks and wait for human input.
5. Delegate to subagents using compiled CCEP prompts — never forward raw \`$ARGUMENTS\` to planners.${orderLine}

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
  const marker =
    '5. Delegate to subagents using compiled CCEP prompts — never forward raw `$ARGUMENTS` to planners.';
  const idx = content.indexOf(marker);
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
  if (content.includes('## Step 0 — CCEP Bootstrap')) {
    return content;
  }

  const block = bootstrap(cmd);

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

  if (content.includes('\n\n## Step 0 — Validate')) {
    return content.replace('\n\n## Step 0 — Validate', `\n\n${block}## Step 0 — Validate`);
  }

  if (content.includes('Scope: $ARGUMENTS\n\n1.')) {
    return content.replace('Scope: $ARGUMENTS\n\n1.', `Scope: $ARGUMENTS\n\n${block}1.`);
  }

  return content;
}

function writeCouncilPreset(targetPath: string): void {
  const template = readFileSync(join(ROOT, 'presets/agy/workflows/cc-council.md'), 'utf-8');
  let body = template.replace(/^---[\s\S]*?---\n\n/, '');
  body = injectBootstrap(body, 'council');
  const wrapped = `---\ndescription: Council-driven workflow with CCEP-1 bootstrap\n---\n\n${body}`;
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, wrapped);
}

let updated = 0;
for (const runner of RUNNER_PATHS) {
  for (const cmd of COMMANDS) {
    const filePath = join(ROOT, runner.dir, runner.resolve(cmd));
    if (!existsSync(filePath)) {
      if (cmd === 'council') {
        writeCouncilPreset(filePath);
        updated++;
        continue;
      }
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

