/**
 * Preset registry - lists available presets
 */
export interface PresetInfo {
  readonly name: string
  readonly version: string
  readonly description: string
  readonly path: string
}

/**
 * Available presets
 */
export const PRESETS: PresetInfo[] = [
  {
    name: 'council',
    version: '0.1.0',
    description: 'Multi-agent council for code review and architecture',
    path: './presets/council/council.yml'
  }
]

/**
 * Get preset by name
 */
export function getPreset(name: string): PresetInfo | undefined {
  return PRESETS.find(p => p.name === name)
}

/**
 * List all available presets
 */
export function listPresets(): PresetInfo[] {
  return [...PRESETS]
}