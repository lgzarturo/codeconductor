#!/usr/bin/env bun
/**
 * Regenerate every derived preset artifact, then fail if the working tree
 * still differs — i.e. someone hand-edited a generated file, or a generator
 * change was committed without also committing its regenerated output.
 *
 * Two independent generators, two independent canonical sources:
 * - Codex skills + Gemini TOML commands, derived from
 *   presets/cursor/commands/cc/*.md (renderAll()).
 * - Shared skill copies, derived from skills/<name>/SKILL.md (syncAll()).
 */
import { spawnSync } from 'node:child_process';
import { renderAll } from './render-agent-commands';
import { loadSharedSkills, syncAll } from './sync-shared-skills';
import { WORKFLOW_COMMANDS } from '../src/core/presets/workflow-commands';

renderAll();
syncAll();

// Scoped to exactly the files renderAll() writes — not the whole directory,
// which also holds hand-maintained siblings like ask.toml/cc-ask (not a
// WORKFLOW_COMMAND). A directory-level pathspec would flag a legitimate
// manual edit to one of those as "drift" even though the generator never
// touches them.
const generatedPaths = [
  ...WORKFLOW_COMMANDS.flatMap((cmd) => [
    `presets/gemini/commands/cc/${cmd}.toml`,
    `presets/codex/skills/cc-${cmd}/SKILL.md`,
  ]),
  ...loadSharedSkills().flatMap((entry) =>
    entry.targets.map((target) => `presets/${target}/skills/${entry.name}/SKILL.md`)
  ),
];

const result = spawnSync('git', ['diff', '--exit-code', '--', ...generatedPaths], {
  encoding: 'utf-8',
});

if (result.status !== 0) {
  process.stderr.write(
    'Generated presets are out of sync with their canonical source.\n' +
      'Run `bun run render:commands` and/or `bun run sync:skills` and commit the diff.\n\n'
  );
  process.stderr.write(result.stdout || '');
  process.exit(1);
}

process.stdout.write(
  'Generated presets (Gemini TOML, Codex skills, shared skill copies) are in sync with their canonical sources.\n'
);
