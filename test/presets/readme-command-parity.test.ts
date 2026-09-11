import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { WORKFLOW_COMMANDS } from '../../src/core/presets/workflow-commands';

const ROOT = resolve(import.meta.dir, '../..');

describe('README slash command tiering table', () => {
  test('lists every WORKFLOW_COMMAND plus ask, and nothing else', async () => {
    const readme = await readFile(resolve(ROOT, 'README.md'), 'utf-8');

    const start = readme.indexOf('### Slash commands');
    expect(start).toBeGreaterThan(-1);
    const end = readme.indexOf('\n### ', start + 1);
    const section = readme.slice(start, end === -1 ? undefined : end);

    const listed = new Set(
      [...section.matchAll(/`\/cc-([a-z0-9-]+)`/g)].map((m) => m[1])
    );

    const expected = new Set<string>([...WORKFLOW_COMMANDS, 'ask']);

    // This is the exact regression WF009 described: the table drifted to 18
    // or 20 entries while WORKFLOW_COMMANDS grew to 21 — a silent
    // documentation gap rather than a rendering bug, but just as invisible
    // to a user picking a command from the README.
    const missing = [...expected].filter((c) => !listed.has(c));
    const stale = [...listed].filter((c) => !expected.has(c));

    expect(missing).toEqual([]);
    expect(stale).toEqual([]);
  });
});
