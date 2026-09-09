#!/usr/bin/env bun
/**
 * Regenerate the Codex skills and Gemini TOML commands derived from
 * presets/cursor/commands/cc/*.md, then fail if the working tree still
 * differs — i.e. someone hand-edited a generated file, or a generator change
 * was committed without also committing its regenerated output.
 */
import { spawnSync } from 'node:child_process';
import { renderAll } from './render-agent-commands';

renderAll();

const result = spawnSync(
  'git',
  ['diff', '--exit-code', '--', 'presets/gemini/commands/cc', 'presets/codex/skills/cc-*'],
  { encoding: 'utf-8' }
);

if (result.status !== 0) {
  process.stderr.write(
    'Generated presets are out of sync with presets/cursor/commands/cc/*.md.\n' +
      'Run `bun run render:commands` and commit the diff.\n\n'
  );
  process.stderr.write(result.stdout || '');
  process.exit(1);
}

process.stdout.write('Generated presets (Gemini TOML, Codex skills) are in sync with their cursor source.\n');
