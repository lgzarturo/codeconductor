#!/usr/bin/env bun
/**
 * Regenerate the Codex skills and Gemini TOML commands derived from
 * presets/cursor/commands/cc/*.md, then fail if the working tree still
 * differs — i.e. someone hand-edited a generated file, or a generator change
 * was committed without also committing its regenerated output.
 */
import { spawnSync } from 'node:child_process';
import { renderAll } from './render-agent-commands';
import { WORKFLOW_COMMANDS } from '../src/core/presets/workflow-commands';

renderAll();

// Scoped to exactly the files renderAll() writes — not the whole directory,
// which also holds hand-maintained siblings like ask.toml/cc-ask (not a
// WORKFLOW_COMMAND). A directory-level pathspec would flag a legitimate
// manual edit to one of those as "drift" even though the generator never
// touches them.
const generatedPaths = WORKFLOW_COMMANDS.flatMap((cmd) => [
  `presets/gemini/commands/cc/${cmd}.toml`,
  `presets/codex/skills/cc-${cmd}/SKILL.md`,
]);

const result = spawnSync('git', ['diff', '--exit-code', '--', ...generatedPaths], {
  encoding: 'utf-8',
});

if (result.status !== 0) {
  process.stderr.write(
    'Generated presets are out of sync with presets/cursor/commands/cc/*.md.\n' +
      'Run `bun run render:commands` and commit the diff.\n\n'
  );
  process.stderr.write(result.stdout || '');
  process.exit(1);
}

process.stdout.write('Generated presets (Gemini TOML, Codex skills) are in sync with their cursor source.\n');
