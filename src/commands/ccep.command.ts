import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { compilePrompt } from '../core/ccep/prompt-compiler';
import { parseJsonInput, validateOutputForRole } from '../core/ccep/output-validator';
import { parseCommand } from '../core/ccep/command-parser';
import { resolveContext } from '../core/ccep/context-resolver';
import {
  loadWorkflowProfile,
  resolveWorkflowPhase,
} from '../core/ccep/workflow-profile-loader';
import { validateExecutionContext, WorkflowCommandSchema } from '../validation/schemas';
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
    const filePath = isAbsolute(raw.slice(1)) ? raw.slice(1) : resolve(projectRoot, raw.slice(1));
    try {
      const content = await readFile(filePath, 'utf-8');
      return { ok: true, data: parseJsonInput(content) };
    } catch (err) {
      return { ok: false, error: `Could not read input file: ${String(err)}` };
    }
  }

  try {
    return { ok: true, data: parseJsonInput(raw) };
  } catch (err) {
    return { ok: false, error: `Invalid JSON input: ${String(err)}` };
  }
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
    promptVersion = 'v0.6.0',
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
        const filePath = isAbsolute(contextPath)
          ? contextPath
          : resolve(projectRoot, contextPath);
        const content = await readFile(filePath, 'utf-8');
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

    default:
      return {
        code: 1,
        data: {
          success: false,
          command: 'ccep',
          errors: [
            `Unknown subcommand: ${subcommand}. Use: parse, profile, resolve, compile, validate`,
          ],
        },
      };
  }
}
