import { resolve } from 'node:path'
import { homedir } from 'node:os'
import type { OutputMode } from '../utils/logger'
import { loadCouncilPreset } from '../core/presets/preset-loader'
import { writeGeneratedFiles, type WriteOptions } from '../core/filesystem/file-writer'
import { parseRunnerTarget, getIndividualTargets } from '../core/runner/runner-target'
import { createOpenCodeInstaller } from '../adapters/opencode/opencode-installer'
import { createClaudeInstaller } from '../adapters/claude/claude-installer'
import { createCodexInstaller } from '../adapters/codex/codex-installer'

export interface InstallOptions {
  readonly target: string
  readonly dryRun: boolean
  readonly force: boolean
  readonly global: boolean
  readonly output: OutputMode
  readonly projectRoot: string
}

/**
 * Install preset to runner targets.
 * With --global, writes to ~/.<target>/ instead of ./.<target>/
 */
export async function installCommand(options: InstallOptions): Promise<{ code: number; data?: unknown }> {
  const { target, dryRun, force, global: isGlobal, output, projectRoot } = options

  const baseDir = isGlobal ? homedir() : projectRoot

  try {
    const runnerTarget = parseRunnerTarget(target)
    const targets = getIndividualTargets(runnerTarget)

    const presetResult = await loadCouncilPreset(projectRoot)
    if (!presetResult.success) {
      return {
        code: 1,
        data: {
          success: false,
          command: 'install',
          errors: [presetResult.error.message]
        }
      }
    }

    const spec = presetResult.data
    const writeOptions: WriteOptions = { dryRun, force }
    const allFiles: { target: string; path: string; success: boolean; error?: string }[] = []

    for (const t of targets) {
      let installer
      switch (t) {
        case 'opencode':
          installer = createOpenCodeInstaller(spec)
          break
        case 'claude':
          installer = createClaudeInstaller(spec)
          break
        case 'codex':
          installer = createCodexInstaller(spec)
          break
        default:
          continue
      }

      const generatedFiles = await installer.generate()

      // Anchor relative paths to baseDir
      const resolvedFiles = generatedFiles.map(f => ({
        ...f,
        path: resolve(baseDir, f.path)
      }))

      const results = await writeGeneratedFiles(resolvedFiles, writeOptions)

      for (const result of results) {
        allFiles.push({
          target: t,
          path: result.path,
          success: result.success,
          error: result.error
        })
      }
    }

    const errors = allFiles.filter(f => !f.success).map(f => `${f.path}: ${f.error}`)
    const successes = allFiles.filter(f => f.success)

    if (errors.length > 0 && successes.length === 0) {
      return {
        code: 2,
        data: {
          success: false,
          command: 'install',
          errors
        }
      }
    }

    if (errors.length > 0) {
      return {
        code: 2,
        data: {
          success: true,
          command: 'install',
          message: 'Some files could not be written',
          written: successes.map(s => s.path),
          errors
        }
      }
    }

    return {
      code: 0,
      data: {
        success: true,
        command: 'install',
        targets,
        global: isGlobal,
        written: successes.map(s => s.path)
      }
    }
  } catch (error) {
    return {
      code: 1,
      data: {
        success: false,
        command: 'install',
        errors: [String(error)]
      }
    }
  }
}
