import type { OutputMode } from '../utils/logger'
import { detectProject } from '../core/detection/project-detector'

export interface DetectOptions {
  readonly output: OutputMode
  readonly projectRoot: string
}

/**
 * Detect project stack
 */
export async function detectCommand(options: DetectOptions): Promise<{ code: number; data?: unknown }> {
  const { projectRoot, output } = options

  try {
    const profile = await detectProject(projectRoot)

    // Check if project has any signals
    if (profile.signals.length === 0) {
      return {
        code: 3,
        data: {
          success: false,
          command: 'detect',
          errors: ['No project signals detected. Project may be empty or unsupported.']
        }
      }
    }

    return {
      code: 0,
      data: {
        success: true,
        command: 'detect',
        detected: {
          languages: profile.languages,
          runtimes: profile.runtimes,
          packageManagers: profile.packageManagers,
          frameworks: profile.frameworks,
          signals: profile.signals,
          confidence: profile.confidence
        },
        recommendedPresets: getRecommendedPresets(profile)
      }
    }
  } catch (error) {
    return {
      code: 1,
      data: {
        success: false,
        command: 'detect',
        errors: [String(error)]
      }
    }
  }
}

function getRecommendedPresets(profile: { runtimes: readonly string[]; frameworks: readonly string[] }): string[] {
  const presets: string[] = ['council']

  if (profile.runtimes.includes('node') || profile.runtimes.includes('bun')) {
    presets.push('node-best-practices')
  }

  if (profile.frameworks.includes('spring')) {
    presets.push('spring-best-practices')
  }

  if (profile.frameworks.includes('django')) {
    presets.push('django-best-practices')
  }

  return presets
}
