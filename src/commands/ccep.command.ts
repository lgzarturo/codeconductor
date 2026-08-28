import { readFileWithinRoot } from '../core/filesystem/path-containment';
import { evaluateConfirmationGate } from '../core/ccep/confirmation-gate';
import { compilePrompt } from '../core/ccep/prompt-compiler';
import { parseJsonInput, validateOutputForRole } from '../core/ccep/output-validator';
import { parseCommand } from '../core/ccep/command-parser';
import { resolveContext } from '../core/ccep/context-resolver';
import {
  loadWorkflowProfile,
  resolveWorkflowPhase,
} from '../core/ccep/workflow-profile-loader';
import {
  councilConsensus,
  type ConsensusConfig,
  type CouncilVerdictInput,
} from '../domain/council/council-consensus';
import { validateTaskCardForProfile } from '../core/ccep/task-card-validator';
import {
  CanonicalTaskCardSchema,
  ConsensusConfigSchema,
  validateExecutionContext,
  validatePlannerOutput,
  WorkflowCommandSchema,
} from '../validation/schemas';
import type { OutputMode } from '../utils/logger';

export interface CcepOptions {
  readonly subcommand: string;
  readonly projectRoot: string;
  readonly output: OutputMode;
  readonly command?: string;
  readonly userRequest?: string;
  readonly phase?: string;
  readonly role?: string;
  readonly input?: string;
  readonly contextPath?: string;
  readonly promptVersion?: string;
  readonly config?: string;
  readonly rest?: string[];
}

function parseWorkflowCommand(command: string | undefined): {
  readonly ok: true;
  readonly command: ReturnType<typeof WorkflowCommandSchema.parse>;
} | {
  readonly ok: false;
  readonly error: string;
} {
  if (!command) {
    return { ok: false, error: 'Missing required --command flag' };
  }
  const result = WorkflowCommandSchema.safeParse(command);
  if (!result.success) {
    return { ok: false, error: `Unknown workflow command: ${command}` };
  }
  return { ok: true, command: result.data };
}

function containedContextError(contextPath: string): string {
  return (
    `Could not read --context file: ${contextPath}. ` +
    'It must be a regular file at a relative path inside the project root.'
  );
}

/**
 * Read a `--context` file confined to the project root. A missing, escaping or
 * symlinked path is reported as absent rather than raised, so every caller
 * fails closed with the same message.
 */
async function readContainedContext(
  projectRoot: string,
  contextPath: string,
): Promise<string | undefined> {
  try {
    return await readFileWithinRoot(projectRoot, contextPath);
  } catch {
    return undefined;
  }
}

async function readInputPayload(
  projectRoot: string,
  input?: string,
  rest?: string[],
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const raw = input ?? rest?.join(' ').trim();
  if (!raw) {
    return { ok: false, error: 'Missing required --input or inline JSON payload' };
  }

  if (raw.startsWith('@')) {
    const relPath = raw.slice(1);
    let content: string | undefined;
    try {
      content = await readFileWithinRoot(projectRoot, relPath);
    } catch (err) {
      return { ok: false, error: `Could not read input file: ${String(err)}` };
    }
    if (content === undefined) {
      return {
        ok: false,
        error:
          `Could not read input file: ${relPath}. ` +
          'It must be a regular file at a relative path inside the project root.',
      };
    }
    try {
      return { ok: true, data: parseJsonInput(content) };
    } catch (err) {
      return { ok: false, error: `Invalid JSON input: ${String(err)}` };
    }
  }

  try {
    return { ok: true, data: parseJsonInput(raw) };
  } catch (err) {
    return { ok: false, error: `Invalid JSON input: ${String(err)}` };
  }
}

function consensusExitCode(status: 'APPROVED' | 'REJECTED' | 'ESCALATED'): number {
  if (status === 'APPROVED') return 0;
  if (status === 'REJECTED') return 1;
  return 2;
}

function parseConsensusPayload(data: unknown):
  | { ok: true; verdicts: CouncilVerdictInput[]; config?: ConsensusConfig }
  | { ok: false; error: string } {
  if (Array.isArray(data)) {
    return { ok: true, verdicts: data as CouncilVerdictInput[] };
  }
  if (typeof data !== 'object' || data === null) {
    return { ok: false, error: 'Consensus input must be a verdicts array or { verdicts, config? }' };
  }
  const record = data as { verdicts?: unknown; config?: unknown };
  if (!Array.isArray(record.verdicts)) {
    return { ok: false, error: 'Consensus input must be a verdicts array or { verdicts, config? }' };
  }
  let config: ConsensusConfig | undefined;
  if (record.config !== undefined) {
    const parsed = ConsensusConfigSchema.safeParse(record.config);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
      };
    }
    config = parsed.data;
  }
  return { ok: true, verdicts: record.verdicts as CouncilVerdictInput[], config };
}

export async function ccepCommand(
  options: CcepOptions,
): Promise<{ code: number; data?: unknown }> {
  const {
    subcommand,
    projectRoot,
    command,
    userRequest,
    phase,
    role,
    input,
    contextPath,
    promptVersion = 'v1.0.0',
    config,
    rest,
  } = options;

  switch (subcommand) {
    case 'parse': {
      const parsed = parseWorkflowCommand(command);
      if (!parsed.ok) {
        return {
          code: 1,
          data: { success: false, command: 'ccep parse', errors: [parsed.error] },
        };
      }
      const envelope = parseCommand(parsed.command, userRequest ?? '', projectRoot);
      return {
        code: 0,
        data: { success: true, command: 'ccep parse', envelope },
      };
    }

    case 'profile': {
      const cmd = command ?? userRequest;
      const parsed = parseWorkflowCommand(cmd);
      if (!parsed.ok) {
        return {
          code: 1,
          data: { success: false, command: 'ccep profile', errors: [parsed.error] },
        };
      }
      const profile = loadWorkflowProfile(parsed.command, projectRoot);
      return {
        code: 0,
        data: { success: true, command: 'ccep profile', profile },
      };
    }

    case 'resolve': {
      const parsed = parseWorkflowCommand(command);
      if (!parsed.ok) {
        return {
          code: 1,
          data: { success: false, command: 'ccep resolve', errors: [parsed.error] },
        };
      }
      const profile = loadWorkflowProfile(parsed.command, projectRoot);
      const envelope = parseCommand(parsed.command, userRequest ?? '', projectRoot);
      const context = await resolveContext(envelope, profile, projectRoot);
      return {
        code: 0,
        data: { success: true, command: 'ccep resolve', context, phase },
      };
    }

    case 'compile': {
      const parsed = parseWorkflowCommand(command);
      if (!parsed.ok) {
        return {
          code: 1,
          data: { success: false, command: 'ccep compile', errors: [parsed.error] },
        };
      }

      const profile = loadWorkflowProfile(parsed.command, projectRoot);
      const phaseId = phase ?? profile.phases[0]?.id;
      if (!phaseId) {
        return {
          code: 1,
          data: { success: false, command: 'ccep compile', errors: ['Workflow has no phases'] },
        };
      }

      const resolvedPhase = resolveWorkflowPhase(profile, phaseId);
      if (!resolvedPhase) {
        return {
          code: 1,
          data: {
            success: false,
            command: 'ccep compile',
            errors: [`Unknown phase: ${phaseId}`],
          },
        };
      }

      const agentRole = role ?? resolvedPhase.role;
      let context;

      if (contextPath) {
        const content = await readContainedContext(projectRoot, contextPath);
        if (content === undefined) {
          return {
            code: 1,
            data: {
              success: false,
              command: 'ccep compile',
              errors: [containedContextError(contextPath)],
            },
          };
        }
        context = validateExecutionContext(parseJsonInput(content));
      } else {
        const envelope = parseCommand(parsed.command, userRequest ?? '', projectRoot);
        context = await resolveContext(envelope, profile, projectRoot);
        context = {
          ...context,
          currentPhase: phaseId,
          outputSchema: resolvedPhase.outputSchema,
        };
      }

      const compiled = compilePrompt({
        role: agentRole,
        phase: phaseId,
        context,
        promptVersion,
      });

      return {
        code: 0,
        data: {
          success: true,
          command: 'ccep compile',
          phase: phaseId,
          role: agentRole,
          outputSchema: resolvedPhase.outputSchema,
          promptVersion,
          layers: compiled.layers,
          prompt: compiled.prompt,
        },
      };
    }

    case 'validate': {
      const parsed = parseWorkflowCommand(command);
      if (!parsed.ok) {
        return {
          code: 1,
          data: { success: false, command: 'ccep validate', errors: [parsed.error] },
        };
      }

      const profile = loadWorkflowProfile(parsed.command, projectRoot);
      const phaseId = phase ?? profile.phases[0]?.id;
      if (!phaseId) {
        return {
          code: 1,
          data: { success: false, command: 'ccep validate', errors: ['Workflow has no phases'] },
        };
      }

      const resolvedPhase = resolveWorkflowPhase(profile, phaseId);
      if (!resolvedPhase) {
        return {
          code: 1,
          data: {
            success: false,
            command: 'ccep validate',
            errors: [`Unknown phase: ${phaseId}`],
          },
        };
      }

      const agentRole = role ?? resolvedPhase.role;
      const payload = await readInputPayload(projectRoot, input, rest);
      if (!payload.ok) {
        return {
          code: 1,
          data: { success: false, command: 'ccep validate', errors: [payload.error] },
        };
      }

      if (profile.taskCard && CanonicalTaskCardSchema.safeParse(payload.data).success) {
        const issues = validateTaskCardForProfile(profile, payload.data);
        return {
          code: issues.length === 0 ? 0 : 1,
          data: {
            success: issues.length === 0,
            command: 'ccep validate',
            phase: phaseId,
            role: agentRole,
            schema: 'taskcard',
            valid: issues.length === 0,
            issues,
            errors: issues.map((issue) => issue.message),
          },
        };
      }

      const result = validateOutputForRole(
        agentRole,
        resolvedPhase.outputSchema,
        payload.data,
      );

      return {
        code: result.valid ? 0 : 1,
        data: {
          success: result.valid,
          command: 'ccep validate',
          phase: phaseId,
          role: agentRole,
          schema: result.schema,
          valid: result.valid,
          errors: result.errors,
          data: result.data,
        },
      };
    }

    case 'taskcard': {
      const parsed = parseWorkflowCommand(command);
      if (!parsed.ok) {
        return {
          code: 1,
          data: { success: false, command: 'ccep taskcard', errors: [parsed.error] },
        };
      }
      const profile = loadWorkflowProfile(parsed.command, projectRoot);
      if (!profile.taskCard) {
        return {
          code: 1,
          data: {
            success: false,
            command: 'ccep taskcard',
            errors: [`Workflow "${parsed.command}" does not declare a taskCard contract`],
          },
        };
      }
      const payload = await readInputPayload(projectRoot, input, rest);
      if (!payload.ok) {
        return {
          code: 1,
          data: { success: false, command: 'ccep taskcard', errors: [payload.error] },
        };
      }
      const issues = validateTaskCardForProfile(profile, payload.data);
      return {
        code: issues.length === 0 ? 0 : 1,
        data: {
          success: issues.length === 0,
          command: 'ccep taskcard',
          workflow: parsed.command,
          issues,
          errors: issues.map((issue) => issue.message),
        },
      };
    }

    case 'consensus': {
      const payload = await readInputPayload(projectRoot, input, rest);
      if (!payload.ok) {
        return {
          code: 1,
          data: { success: false, command: 'ccep consensus', errors: [payload.error] },
        };
      }

      const parsedBallots = parseConsensusPayload(payload.data);
      if (!parsedBallots.ok) {
        return {
          code: 1,
          data: { success: false, command: 'ccep consensus', errors: [parsedBallots.error] },
        };
      }

      let mergedConfig = parsedBallots.config;
      if (config) {
        const configPayload = await readInputPayload(projectRoot, config);
        if (!configPayload.ok) {
          return {
            code: 1,
            data: {
              success: false,
              command: 'ccep consensus',
              errors: [`Invalid --config: ${configPayload.error}`],
            },
          };
        }
        const parsedConfig = ConsensusConfigSchema.safeParse(configPayload.data);
        if (!parsedConfig.success) {
          return {
            code: 1,
            data: {
              success: false,
              command: 'ccep consensus',
              errors: parsedConfig.error.issues.map(
                (issue) => `${issue.path.join('.')}: ${issue.message}`,
              ),
            },
          };
        }
        mergedConfig = { ...mergedConfig, ...parsedConfig.data };
      }

      const verdict = councilConsensus(parsedBallots.verdicts, mergedConfig);
      return {
        code: consensusExitCode(verdict.status),
        data: {
          success: verdict.status === 'APPROVED',
          command: 'ccep consensus',
          verdict,
        },
      };
    }

    case 'evaluate': {
      const parsed = parseWorkflowCommand(command);
      if (!parsed.ok) {
        return {
          code: 1,
          data: { success: false, command: 'ccep evaluate', errors: [parsed.error] },
        };
      }

      const payload = await readInputPayload(projectRoot, input, rest);
      if (!payload.ok) {
        return {
          code: 1,
          data: {
            success: false,
            command: 'ccep evaluate',
            errors: [
              payload.error.includes('Missing required')
                ? 'Missing required planner --input (JSON or @file) for ConfirmationGate evaluation'
                : payload.error,
            ],
          },
        };
      }

      let planner;
      try {
        planner = validatePlannerOutput(payload.data);
      } catch (err) {
        return {
          code: 1,
          data: {
            success: false,
            command: 'ccep evaluate',
            errors: [`Invalid planner output: ${String(err)}`],
          },
        };
      }

      let context;
      try {
        if (contextPath) {
          const content = await readContainedContext(projectRoot, contextPath);
          if (content === undefined) {
            throw new Error(containedContextError(contextPath));
          }
          context = validateExecutionContext(parseJsonInput(content));
        } else {
          const profile = loadWorkflowProfile(parsed.command, projectRoot);
          const envelope = parseCommand(parsed.command, userRequest ?? '', projectRoot);
          context = await resolveContext(envelope, profile, projectRoot);
        }
      } catch (err) {
        return {
          code: 1,
          data: {
            success: false,
            command: 'ccep evaluate',
            errors: [`Could not resolve execution context: ${String(err)}`],
          },
        };
      }

      const decision = evaluateConfirmationGate(context, planner);
      return {
        code: decision.stop ? 1 : 0,
        data: {
          success: !decision.stop,
          command: 'ccep evaluate',
          stop: decision.stop,
          decision,
        },
      };
    }

    default:
      return {
        code: 1,
        data: {
          success: false,
          command: 'ccep',
          errors: [
            `Unknown subcommand: ${subcommand}. Use: parse, profile, resolve, compile, validate, evaluate, consensus, taskcard`,
          ],
        },
      };
  }
}
