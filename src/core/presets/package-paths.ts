import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const moduleDir = dirname(fileURLToPath(import.meta.url))

export const PACKAGE_ROOT = moduleDir.endsWith(`${sep}dist`)
  ? resolve(moduleDir, '..')
  : resolve(moduleDir, '..', '..', '..')

export const SRC_PRESETS_DIR = resolve(PACKAGE_ROOT, 'src', 'presets')
export const ROOT_PRESETS_DIR = resolve(PACKAGE_ROOT, 'presets')
export const POLICY_PATH = resolve(PACKAGE_ROOT, 'policy.yml')
