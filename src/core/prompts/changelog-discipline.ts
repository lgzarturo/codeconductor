const PROMPT_CONTRACT_PATTERNS = [
  /^presets\/[^/]+\/agents\//,
  /^presets\/[^/]+\/commands\//,
  /^presets\/[^/]+\/prompts\//,
  /^presets\/[^/]+\/skills\/[^/]+\/SKILL\.md$/,
  /^presets\/codex\/AGENTS\.md$/,
  /^presets\/claude\/CLAUDE\.md$/,
  /^src\/presets\/models\//,
  /^src\/presets\/manifests\//
]

export interface PromptChangelogValidation {
  readonly required: boolean
  readonly present: boolean
  readonly valid: boolean
  readonly promptFiles: readonly string[]
  readonly message: string
}

export function isPromptContractFile(path: string): boolean {
  const normalized = path.replace(/\\/g, '/')
  return PROMPT_CONTRACT_PATTERNS.some(pattern => pattern.test(normalized))
}

export function validatePromptChangelog(changedFiles: readonly string[]): PromptChangelogValidation {
  const promptFiles = changedFiles.filter(isPromptContractFile)
  const required = promptFiles.length > 0
  const present = changedFiles.some(file => file.replace(/\\/g, '/') === 'CHANGELOG.md')

  if (!required) {
    return {
      required,
      present,
      valid: true,
      promptFiles,
      message: 'No prompt or agent contract files changed.'
    }
  }

  if (!present) {
    return {
      required,
      present,
      valid: false,
      promptFiles,
      message: 'Prompt or agent contract files changed without a CHANGELOG.md update under [Unreleased].'
    }
  }

  return {
    required,
    present,
    valid: true,
    promptFiles,
    message: 'Prompt changelog discipline satisfied.'
  }
}
