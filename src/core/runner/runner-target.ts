/**
 * Runner target type
 */
export type RunnerTarget = 'opencode' | 'claude' | 'codex' | 'gemini' | 'cursor' | 'agy' | 'pi' | 'all';

/**
 * Valid runner targets
 */
export const RUNNER_TARGETS = [
  'opencode',
  'claude',
  'codex',
  'gemini',
  'cursor',
  'agy',
  'pi',
  'all',
] as const;

/**
 * Individual runner targets (excluding 'all')
 */
export const INDIVIDUAL_TARGETS = ['opencode', 'claude', 'codex', 'gemini', 'cursor', 'agy', 'pi'] as const;

/**
 * A single, installable runner target — every RunnerTarget value except
 * 'all'. The single source for the union type repeated inline across
 * loaders/commands (manifest-loader.ts, install.command.ts, ...) — import
 * this instead of re-listing the 7 targets, so adding an 8th only requires
 * updating INDIVIDUAL_TARGETS above.
 */
export type IndividualRunnerTarget = (typeof INDIVIDUAL_TARGETS)[number];

/**
 * Check if a string is a valid runner target
 */
export function isRunnerTarget(value: string): value is RunnerTarget {
  return RUNNER_TARGETS.includes(value as RunnerTarget);
}

/**
 * Parse runner target from string
 */
export function parseRunnerTarget(value: string): RunnerTarget {
  if (!isRunnerTarget(value)) {
    throw new Error(`Invalid runner target: ${value}. Valid targets: ${RUNNER_TARGETS.join(', ')}`);
  }
  return value;
}

/**
 * Get individual targets from 'all' or single target
 */
export function getIndividualTargets(target: RunnerTarget): RunnerTarget[] {
  if (target === 'all') {
    return [...INDIVIDUAL_TARGETS];
  }
  return [target];
}
