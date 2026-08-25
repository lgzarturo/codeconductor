import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '../..');
const HANDOFF_COMMAND_PATH = 'presets/claude/commands/cc/handoff.md';

async function readStep1Section(): Promise<string> {
  const content = await readFile(resolve(ROOT, HANDOFF_COMMAND_PATH), 'utf-8');
  const start = content.search(/## Step 1 — Compact \(docs\)/);
  const end = content.search(/## Completion/);
  expect(start, 'Step 1 section must exist').toBeGreaterThan(-1);
  expect(end, 'Completion section must exist').toBeGreaterThan(start);
  return content.slice(start, end);
}

describe('BC-011: context_scope declaration in /cc:handoff', () => {
  test('Step 1 declares a recommended context_scope for the next session', async () => {
    const section = await readStep1Section();

    expect(section).toMatch(/context_scope/);
    expect(section).toMatch(/recommended|recomendado/i);
  });

  test('the declared context_scope is restricted to the three canonical values', async () => {
    const section = await readStep1Section();

    expect(section).toMatch(/`isolated`/);
    expect(section).toMatch(/`continuation`/);
    expect(section).toMatch(/`full`/);
  });

  test('the value must be derived from the documented Task Card status, not invented', async () => {
    const section = await readStep1Section();

    expect(section).toMatch(/derived|derive/i);
    expect(section).toMatch(/not invented/i);
    expect(section).toMatch(/Task Card status/);
  });
});
