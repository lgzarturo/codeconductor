import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '../..');

/**
 * `ask` is deliberately not a WORKFLOW_COMMAND: it is a pure router (no CCEP
 * Step 0, no OpenSpec gate — see presets/cursor/commands/cc/ask.md) and
 * isn't generated from cursor's source by scripts/render-agent-commands.ts.
 * Each target keeps its own hand-maintained copy, which is exactly why it
 * fell through every previous cross-target syntax fix and drifted: this
 * test is its dedicated parity net.
 */
const ASK_FILES: Array<{ target: string; file: string; invoke: string }> = [
  { target: 'claude', file: 'presets/claude/commands/cc/ask.md', invoke: '/cc:' },
  { target: 'cursor', file: 'presets/cursor/commands/cc/ask.md', invoke: '/cc:' },
  { target: 'gemini', file: 'presets/gemini/commands/cc/ask.toml', invoke: '/cc:' },
  { target: 'opencode', file: 'presets/opencode/commands/cc-ask.md', invoke: '/cc-' },
  { target: 'agy', file: 'presets/agy/workflows/cc-ask.md', invoke: '/cc-' },
  { target: 'codex', file: 'presets/codex/commands/cc-ask.md', invoke: '$cc-' },
];

describe('ask command parity (6 targets, hand-maintained)', () => {
  for (const { target, file, invoke } of ASK_FILES) {
    test(`${target}: recommends its own native invocation syntax`, async () => {
      const content = await readFile(join(ROOT, file), 'utf-8');

      // The catalog table recommends other commands using this target's own
      // syntax — a codex user reading `/cc:feature` from the table would
      // hit a command that doesn't exist on this runner.
      expect(content).toContain(`\`${invoke}feature\``);

      // Every other invocation syntax must be absent from the catalog.
      for (const other of ['/cc:', '/cc-', '$cc-']) {
        if (other === invoke) continue;
        expect(content).not.toContain(`\`${other}feature\``);
      }
    });

    test(`${target}: description carries no leftover [cc: alias] marker`, async () => {
      const content = await readFile(join(ROOT, file), 'utf-8');
      expect(content).not.toContain('[cc: alias]');
    });
  }
});

describe('no [cc: alias] marker leaks into any shipped command', () => {
  test('the marker never reaches a description a user actually sees', async () => {
    const glob = new Bun.Glob('**/*.{md,toml}');
    const offenders: string[] = [];
    for await (const rel of glob.scan({ cwd: join(ROOT, 'presets') })) {
      const full = join(ROOT, 'presets', rel);
      const content = await readFile(full, 'utf-8');
      if (content.includes('[cc: alias]')) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});
