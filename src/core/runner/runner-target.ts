/**
 * Runner target type
 */
export type RunnerTarget = 'opencode' | 'claude' | 'codex' | 'all'

/**
 * Valid runner targets
 */
export const RUNNER_TARGETS = ['opencode', 'claude', 'codex', 'all'] as const

/**
 * Individual runner targets (excluding 'all')
 */
export const INDIVIDUAL_TARGETS = ['opencode', 'claude', 'codex'] as const

/**
 * Check if a string is a valid runner target
 */
export function isRunnerTarget(value: string): value is RunnerTarget {
  return RUNNER_TARGETS.includes(value as RunnerTarget)
}

/**
 * Parse runner target from string
 */
export function parseRunnerTarget(value: string): RunnerTarget {
  if (!isRunnerTarget(value)) {
    throw new Error(`Invalid runner target: ${value}. Valid targets: ${RUNNER_TARGETS.join(', ')}`)
  }
  return value
}

/**
 * Get individual targets from 'all' or single target
 */
export function getIndividualTargets(target: RunnerTarget): RunnerTarget[] {
  if (target === 'all') {
    return [...INDIVIDUAL_TARGETS]
  }
  return [target]
}