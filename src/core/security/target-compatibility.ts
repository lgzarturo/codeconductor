import { readFile } from 'node:fs/promises'
import { parse } from 'yaml'
import type { RunnerTargetInput } from '../../validation/schemas'
import { POLICY_PATH } from '../presets/package-paths'

export interface TargetSecurityCompatibility {
  readonly target: Exclude<RunnerTargetInput, 'all'>
  readonly status: 'pass' | 'warn' | 'fail'
  readonly unsupportedRules: readonly string[]
  readonly warnings: readonly string[]
}

interface PolicyTarget {
  readonly unsupportedRules?: readonly string[]
  readonly warnings?: readonly string[]
}

interface PolicyModel {
  readonly targets?: Partial<Record<Exclude<RunnerTargetInput, 'all'>, PolicyTarget>>
}

export async function loadTargetSecurityCompatibility(): Promise<TargetSecurityCompatibility[]> {
  const policy = parse(await readFile(POLICY_PATH, 'utf-8')) as PolicyModel
  const targets: Array<Exclude<RunnerTargetInput, 'all'>> = ['opencode', 'claude', 'codex', 'gemini', 'cursor']

  return targets.map(target => {
    const policyTarget = policy.targets?.[target]
    if (!policyTarget) {
      return {
        target,
        status: 'fail' as const,
        unsupportedRules: [],
        warnings: [`No security compatibility policy found for ${target}.`]
      }
    }

    const unsupportedRules = policyTarget.unsupportedRules ?? []
    const warnings = policyTarget.warnings ?? []

    return {
      target,
      status: unsupportedRules.length > 0 || warnings.length > 0 ? 'warn' as const : 'pass' as const,
      unsupportedRules,
      warnings
    }
  })
}
