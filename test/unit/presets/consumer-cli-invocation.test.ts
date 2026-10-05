/**
 * Consumer projects (adpilot, …) have no `dev` script, so any skill, preset,
 * hook or generated command that tells an agent to run `bun run dev` fails
 * there with `Script not found "dev"`. `bun run dev` is only for developing
 * this repo (CLAUDE.md, AGENTS.md, docs/); everything shipped to consumers
 * must use `npx cc-codeconductor`.
 */
import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hookCommand } from '../../../src/commands/hook.command';

const repoRoot = dirname(fileURLToPath(new URL('../../../package.json', import.meta.url)));

/** Maintainer-only material that legitimately documents the local dev loop. */
const MAINTAINER_ONLY = [
  'src/utils/cli-bin.ts',
  'skills/cc-self-review/',
  'skills/cc-update-preset-models/',
];

describe('consumer-facing CLI invocation', () => {
  test('no shipped skill, preset, script or source tells agents to run `bun run dev`', () => {
    const tracked = spawnSync(
      'git',
      ['ls-files', '--', 'src', 'scripts', 'skills', 'presets', '.agents', '.cursor', '.gemini', '.pi'],
      { cwd: repoRoot, encoding: 'utf-8' },
    ).stdout.split('\n').filter(Boolean);

    const offenders = tracked
      .filter((file) => !MAINTAINER_ONLY.some((prefix) => file.startsWith(prefix)))
      .filter((file) => readFileSync(join(repoRoot, file), 'utf-8').includes('bun run dev'));

    expect(offenders).toEqual([]);
  });

  test('the SessionStart hook points agents at npx cc-codeconductor', async () => {
    const chunks: string[] = [];
    const write = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      chunks.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    try {
      await hookCommand({ event: 'session-start', projectRoot: repoRoot, stdinText: '' } as never);
    } finally {
      process.stdout.write = write;
    }
    const output = chunks.join('');
    expect(output).toContain('npx cc-codeconductor');
    expect(output).not.toContain('bun run dev');
  });
});
