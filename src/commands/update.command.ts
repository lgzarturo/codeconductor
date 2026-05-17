import type { OutputMode } from '../utils/logger'
import { loadConfig } from '../core/config/config-loader'
import { loadCouncilPreset } from '../core/presets/preset-loader'
import { writeGeneratedFiles, type WriteOptions } from '../core/filesystem/file-writer'
import { createOpenCodeInstaller } from '../adapters/opencode/opencode-installer'
import { createClaudeInstaller } from '../adapters/claude/claude-installer'
import { createCodexInstaller } from '../adapters/codex/codex-installer'

export interface UpdateOptions {
  readonly dryRun: boolean
  readonly force: boolean
  readonly output: OutputMode
  readonly projectRoot: string
}

/**
 * Update installed presets
 */
export async function updateCommand(options: UpdateOptions): Promise<{ code: number; data?: unknown }> {
  const { dryRun, force, output, projectRoot } = options

  try {
    // Load current config
    const configResult = await loadConfig(projectRoot)
    if (!configResult.success) {
      return {
        code: 1,
        data: {
          success: false,
          command: 'update',
          errors: ['No config found. Run `codeconductor init` first.']
        }
      }
    }

    const config = configResult.data

    // Check if council is enabled
    if (!config.presets.council.enabled) {
      return {
        code: 4,
        data: {
          success: false,
          command: 'update',
          errors: ['Council preset is not enabled']
        }
      }
    }

    // Load latest preset (check .codeconductor/presets/ first)
    const presetResult = await loadCouncilPreset(projectRoot)
    if (!presetResult.success) {
      return {
        code: 1,
        data: {
          success: false,
          command: 'update',
          errors: ['Failed to load preset']
        }
      }
    }

    const spec = presetResult.data

    // Compare versions
    const currentVersion = config.presets.council.version
    const newVersion = spec.version

    if (currentVersion === newVersion) {
      return {
        code: 0,
        data: {
          success: true,
          command: 'update',
          message: 'Already up to date',
          currentVersion,
          newVersion
        }
      }
    }

    // Dry run
    if (dryRun) {
      return {
        code: 0,
        data: {
          success: true,
          command: 'update',
          message: 'Dry run - would update',
          currentVersion,
          newVersion,
          wouldUpdate: ['council preset files']
        }
      }
    }

    // Update files based on default target
    const writeOptions: WriteOptions = { dryRun: false, force }
    const target = config.defaults.target

    let installer
    switch (target) {
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
        return {
          code: 1,
          data: {
            success: false,
            command: 'update',
            errors: [`Unknown target: ${target}`]
          }
        }
    }

    const files = await installer.generate()
    const results = await writeGeneratedFiles(files, writeOptions)

    const updated = results.filter(r => r.success).map(r => r.path)
    const errors = results.filter(r => !r.success).map(r => `${r.path}: ${r.error}`)

    if (errors.length > 0) {
      return {
        code: 2,
        data: {
          success: false,
          command: 'update',
          errors
        }
      }
    }

    return {
      code: 0,
      data: {
        success: true,
        command: 'update',
        message: 'Updated successfully',
        currentVersion,
        newVersion,
        updated
      }
    }
  } catch (error) {
    return {
      code: 1,
      data: {
        success: false,
        command: 'update',
        errors: [String(error)]
      }
    }
  }
}