import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '../..');
const FIX_COMMAND_PATH = 'presets/claude/commands/cc/fix.md';

describe('BC-004: red loop gate in /cc:fix', () => {
  test('gate blocks routing (Step 2) until a reproducible command has run', async () => {
    const content = await readFile(resolve(ROOT, FIX_COMMAND_PATH), 'utf-8');

    const gateHeading = content.search(/## Step 2\.5 — .*[Rr]ed loop/);
    const routeHeading = content.search(/## Step 3 — Route by risk/);

    expect(gateHeading, 'gate step must exist').toBeGreaterThan(-1);
    expect(routeHeading, 'route by risk step must exist').toBeGreaterThan(-1);
    expect(gateHeading).toBeLessThan(routeHeading);
    expect(content).toMatch(/before hypothesizing|antes de hipotetizar/i);
  });

  test('gate requires the loop to be deterministic and assert the exact user symptom', async () => {
    const content = await readFile(resolve(ROOT, FIX_COMMAND_PATH), 'utf-8');
    const gateSection = content.slice(
      content.search(/## Step 2\.5 — .*[Rr]ed loop/),
      content.search(/## Step 3 — Route by risk/),
    );

    expect(gateSection).toMatch(/deterministic/i);
    expect(gateSection).toMatch(/exact.*symptom|symptom.*exact/i);
  });

  test('gate anchors the loop as evidence readable by cc verify', async () => {
    const content = await readFile(resolve(ROOT, FIX_COMMAND_PATH), 'utf-8');
    const gateSection = content.slice(
      content.search(/## Step 2\.5 — .*[Rr]ed loop/),
      content.search(/## Step 3 — Route by risk/),
    );

    expect(gateSection).toMatch(/cc verify/);
    expect(gateSection).toMatch(/evidence/i);
    expect(gateSection).toMatch(/'test'|"test"|`test`/);
  });
});
