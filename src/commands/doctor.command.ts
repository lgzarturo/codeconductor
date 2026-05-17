import type { OutputMode } from '../utils/logger'
import { loadConfig, configExists } from '../core/config/config-loader'
import { validateConfig } from '../validation/schemas'

export interface DoctorOptions {
  readonly output: OutputMode
  readonly projectRoot: string
}

/**
 * Validate configuration and generated files
 */
export async function doctorCommand(options: DoctorOptions): Promise<{ code: number; data?: unknown }> {
  const { projectRoot, output } = options

  const checks: { name: string; status: 'pass' | 'fail' | 'warn'; message: string }[] = []

  try {
    // Check 1: Config exists
    const hasConfig = await configExists(projectRoot)
    if (hasConfig) {
      checks.push({
        name: 'config-exists',
        status: 'pass',
        message: '.codeconductor/config.yml exists'
      })
    } else {
      checks.push({
        name: 'config-exists',
        status: 'fail',
        message: '.codeconductor/config.yml not found. Run `codeconductor init` first.'
      })
      return {
        code: 4,
        data: {
          success: false,
          command: 'doctor',
          checks
        }
      }
    }

    // Check 2: Config is valid
    const configResult = await loadConfig(projectRoot)
    if (configResult.success) {
      checks.push({
        name: 'config-valid',
        status: 'pass',
        message: 'Config is valid'
      })
    } else {
      checks.push({
        name: 'config-valid',
        status: 'fail',
        message: `Config validation failed: ${configResult.error.message}`
      })
      return {
        code: 1,
        data: {
          success: false,
          command: 'doctor',
          checks
        }
      }
    }

    // Check 3: Runner directories
    const runnerDirs = ['.opencode', '.claude', '.codex']
    for (const dir of runnerDirs) {
      try {
        const { access } = await import('node:fs/promises')
        await access(`${projectRoot}/${dir}`)
        checks.push({
          name: `dir-${dir}`,
          status: 'pass',
          message: `${dir}/ exists`
        })
      } catch {
        checks.push({
          name: `dir-${dir}`,
          status: 'warn',
          message: `${dir}/ not found (optional)`
        })
      }
    }

    // Check 4: Preset version
    const config = configResult.data
    if (config.presets.council.enabled) {
      checks.push({
        name: 'council-enabled',
        status: 'pass',
        message: `Council preset enabled (v${config.presets.council.version})`
      })
    }

    // All checks passed
    const failedCount = checks.filter(c => c.status === 'fail').length
    if (failedCount > 0) {
      return {
        code: 4,
        data: {
          success: false,
          command: 'doctor',
          checks
        }
      }
    }

    return {
      code: 0,
      data: {
        success: true,
        command: 'doctor',
        checks
      }
    }
  } catch (error) {
    return {
      code: 1,
      data: {
        success: false,
        command: 'doctor',
        errors: [String(error)]
      }
    }
  }
}