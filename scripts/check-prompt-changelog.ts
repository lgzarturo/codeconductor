import { spawnSync } from 'node:child_process'
import { validatePromptChangelog } from '../src/core/prompts/changelog-discipline'

const result = spawnSync('git', ['diff', '--name-only', 'HEAD'], {
  encoding: 'utf-8'
})

if (result.status !== 0) {
  process.stderr.write(result.stderr || 'Unable to inspect changed files.\n')
  process.exit(result.status ?? 1)
}

const changedFiles = result.stdout.split('\n').map(line => line.trim()).filter(Boolean)
const validation = validatePromptChangelog(changedFiles)

if (!validation.valid) {
  process.stderr.write(`${validation.message}\n`)
  process.stderr.write(`Affected files:\n${validation.promptFiles.map(file => `- ${file}`).join('\n')}\n`)
  process.exit(1)
}

process.stdout.write(`${validation.message}\n`)
