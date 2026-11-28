import { loadModelConfig } from '../presets/manifest-loader';
import { isRegisteredOutputSchema } from './output-validator';
import { loadAllWorkflowProfiles } from './workflow-profile-loader';

const STOP_GATES = new Set(['confirmation', 'approval']);
/** Council personas that are not model-config agent roles. */
const COUNCIL_PERSONAS = new Set(['product', 'delivery', 'data-ops', 'devil', 'planner']);
const KNOWN_SKILLS = new Set(['council']);

export interface ReferentialFinding {
  readonly severity: 'fail' | 'warn';
  readonly code: string;
  readonly message: string;
}

export interface ReferentialReport {
  readonly findings: readonly ReferentialFinding[];
  readonly profilesChecked: number;
}

/**
 * Static referential checks across compiled workflow profiles:
 * agents exist, dependsOn/parallelWith point at real phases, stopGates are
 * known, and outputSchema/skill identifiers resolve.
 */
export async function checkWorkflowReferentialIntegrity(
  projectRoot?: string,
): Promise<ReferentialReport> {
  const findings: ReferentialFinding[] = [];
  const model = await loadModelConfig('claude');
  const knownAgents = new Set([...Object.keys(model.agents), ...COUNCIL_PERSONAS]);
  const profiles = loadAllWorkflowProfiles(projectRoot);

  for (const [command, profile] of profiles) {
    const phaseIds = new Set(profile.phases.map((p) => p.id));

    for (const phaseId of profile.routing.default) {
      if (!phaseIds.has(phaseId)) {
        findings.push({
          severity: 'fail',
          code: 'routing_unknown_phase',
          message: `${command}: routing.default references unknown phase '${phaseId}'`,
        });
      }
    }

    for (const rule of profile.routing.riskRules ?? []) {
      for (const phaseId of rule.then) {
        if (!phaseIds.has(phaseId)) {
          findings.push({
            severity: 'fail',
            code: 'risk_rule_unknown_phase',
            message: `${command}: riskRule.then references unknown phase '${phaseId}'`,
          });
        }
      }
    }

    for (const phase of profile.phases) {
      const agents = [
        ...(phase.agent ? [phase.agent] : []),
        ...(phase.agents ?? []),
      ];
      for (const agent of agents) {
        if (!knownAgents.has(agent)) {
          findings.push({
            severity: 'fail',
            code: 'unknown_agent',
            message: `${command}/${phase.id}: unknown agent '${agent}'`,
          });
        }
      }

      if (phase.skill && !KNOWN_SKILLS.has(phase.skill)) {
        findings.push({
          severity: 'warn',
          code: 'unknown_skill',
          message: `${command}/${phase.id}: skill '${phase.skill}' is not in the static allowlist`,
        });
      }

      if (phase.stopGate && !STOP_GATES.has(phase.stopGate)) {
        findings.push({
          severity: 'fail',
          code: 'unknown_stop_gate',
          message: `${command}/${phase.id}: unknown stopGate '${phase.stopGate}'`,
        });
      }

      if (phase.outputSchema && !isRegisteredOutputSchema(phase.outputSchema)) {
        findings.push({
          severity: 'fail',
          code: 'unknown_output_schema',
          message: `${command}/${phase.id}: unknown outputSchema '${phase.outputSchema}'`,
        });
      }

      for (const dep of phase.dependsOn ?? []) {
        if (!phaseIds.has(dep)) {
          findings.push({
            severity: 'fail',
            code: 'depends_on_unknown',
            message: `${command}/${phase.id}: dependsOn references unknown phase '${dep}'`,
          });
        }
      }

      for (const peer of phase.parallelWith ?? []) {
        if (!phaseIds.has(peer)) {
          findings.push({
            severity: 'fail',
            code: 'parallel_with_unknown',
            message: `${command}/${phase.id}: parallelWith references unknown phase '${peer}'`,
          });
        }
      }
    }
  }

  return { findings, profilesChecked: profiles.size };
}
