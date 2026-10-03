#!/usr/bin/env bun
/**
 * D3 gate: the 5 non-canonical council copies must stay minimal redirect
 * stubs (<400B each, GENERATED banner + canonical pointer, no full Steps
 * body). Fails naming each offending copy; passes on a clean tree so work
 * can proceed. Prints the measured total with bytes/% saved vs the ~19KB
 * pre-D3 baseline (token-audit skill, official bytes/4 + bytes/% method).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');

const CANONICAL = 'presets/agy/workflows/cc-council.md';

const FIVE_TARGETS = [
  'presets/codex/skills/cc-council/SKILL.md',
  'presets/claude/commands/cc/council.md',
  'presets/cursor/commands/cc/council.md',
  'presets/opencode/commands/cc-council.md',
  'presets/gemini/commands/cc/council.toml',
] as const;

/** Full manual Step-0 body marker: present in a full copy, absent in a stub. */
const STEP0_BODY_MARKER = 'ccep compile --command council --phase';

const STUB_MAX_BYTES = 400;

/** Pre-D3 measured total of the 5 copies (4151+3793+3793+3793+3797). */
const BASELINE_BYTES = 19327;

let failed = false;
let total = 0;

for (const rel of FIVE_TARGETS) {
  const content = readFileSync(join(ROOT, rel), 'utf-8');
  const bytes = Buffer.byteLength(content, 'utf8');
  total += bytes;
  const problems: string[] = [];
  if (bytes >= STUB_MAX_BYTES) problems.push(`${bytes}B >= ${STUB_MAX_BYTES}B`);
  if (content.includes(STEP0_BODY_MARKER)) problems.push('carries the full Steps body');
  if (!content.includes(CANONICAL)) problems.push('missing canonical pointer');
  if (!/generated/i.test(content) || !content.includes('DO NOT EDIT')) {
    problems.push('missing GENERATED banner');
  }
  if (problems.length > 0) {
    failed = true;
    console.error(`FAIL ${rel}: ${problems.join('; ')}`);
  }
}

const saved = BASELINE_BYTES - total;
const pct = ((saved / BASELINE_BYTES) * 100).toFixed(1);
console.log(
  `council-redirect: 5 copies total ${total}B vs baseline ${BASELINE_BYTES}B — saved ${saved}B (${pct}%, ~${Math.round(saved / 4)} tokens at bytes/4)`,
);

if (failed) {
  console.error(
    'Council copies drifted from redirect stubs. Regenerate with `bun run scripts/inject-ccep-bootstrap.ts` + `bun run scripts/render-agent-commands.ts` — never hand-edit the copies.',
  );
  process.exit(1);
}

console.log('council-redirect: 5/5 stubs ok');
