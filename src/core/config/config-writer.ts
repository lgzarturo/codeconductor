import { mkdir, writeFile, access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { stringify } from 'yaml'
import type { CodeConductorConfig } from './codeconductor-config'
import { DEFAULT_CONFIG } from './codeconductor-config'
import { err, ok, type Result } from '../../utils/result'
import { ValidationError } from '../../cli/errors'

const CONFIG_DIR = '.codeconductor'
const CONFIG_FILE = 'config.yml'

/**
 * Write initial configuration
 */
export async function writeConfig(
  projectRoot: string,
  config: Partial<CodeConductorConfig> = {},
  force = false
): Promise<Result<void, ValidationError>> {
  try {
    const configDir = resolve(projectRoot, CONFIG_DIR)
    await mkdir(configDir, { recursive: true })

    const configPath = resolve(configDir, CONFIG_FILE)

    if (!force) {
      try {
        await access(configPath)
        return ok(undefined)
      } catch {
        // File doesn't exist — proceed
      }
    }

    const mergedConfig = {
      ...DEFAULT_CONFIG,
      ...config,
      project: {
        ...DEFAULT_CONFIG.project,
        ...config.project
      },
      defaults: {
        ...DEFAULT_CONFIG.defaults,
        ...config.defaults
      },
      presets: {
        ...DEFAULT_CONFIG.presets,
        ...config.presets
      },
      safety: {
        ...DEFAULT_CONFIG.safety,
        ...config.safety
      }
    }

    const yamlContent = stringify(mergedConfig)
    await writeFile(configPath, yamlContent, 'utf-8')

    return ok(undefined)
  } catch (error) {
    return err(new ValidationError('Failed to write config', error))
  }
}

/**
 * Get config file path
 */
export function getConfigPath(projectRoot: string): string {
  return resolve(projectRoot, CONFIG_DIR, CONFIG_FILE)
}