import { runMutationGate } from '../core/verification/mutation-runner';
import { captureTddSuiteEvidence } from '../core/verification/verification-runner';
import type { OutputMode } from '../utils/logger';

export interface TddOptions {
  readonly subcommand: string;
  readonly projectRoot: string;
  readonly output: OutputMode;
  readonly taskId?: string;
  readonly phase?: string;
  readonly command?: string;
  /** Explicit trust for a suite command outside the test allowlist. */
  readonly allowCompileCheck?: boolean;
  readonly target?: string;
  readonly timeoutMs?: string;
  readonly maxMutants?: string;
}

const USAGE =
  'Usage: tdd capture --task <cardId> --phase red|green --command "<test command>" [--allow-compile-check]';

const MUTATE_USAGE =
  'Usage: tdd mutate --target <file> --command "<test command>" [--allow-compile-check] [--timeout-ms <n>] [--max-mutants <n>]';

function parsePositiveInt(raw: string | undefined, flag: string): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${flag} must be a positive integer, got '${raw}'`);
  }
  return value;
}

function fail(errors: string[]): { code: number; data: unknown } {
  return { code: 1, data: { success: false, command: 'tdd', errors } };
}

/**
 * `tdd capture` runs the suite and stores the runner-captured TDD evidence that
 * `openspec done` requires for `test` (RED) and `implement` (GREEN) cards.
 */
export async function tddCommand(
  options: TddOptions,
): Promise<{ code: number; data?: unknown }> {
  const { subcommand, projectRoot, taskId, phase, command } = options;
  if (subcommand === 'mutate') {
    return mutateCommand(options);
  }
  if (subcommand !== 'capture') {
    return fail([`Unknown subcommand: ${subcommand}. ${USAGE} ${MUTATE_USAGE}`]);
  }
  if (!taskId || !command || (phase !== 'red' && phase !== 'green')) {
    return fail([USAGE]);
  }

  const captured = await captureTddSuiteEvidence(projectRoot, taskId, {
    command,
    phase,
    allowCompileCheck: options.allowCompileCheck === true,
  });
  if (!captured.success) return fail([captured.error.message]);

  const { evidenceId, suiteFailed, suitePassed } = captured.data;
  const matches = phase === 'red' ? suiteFailed : suitePassed;
  return {
    code: matches ? 0 : 1,
    data: {
      success: matches,
      command: 'tdd capture',
      taskId,
      phase,
      evidenceId,
      suiteFailed,
      suitePassed,
      ...(matches
        ? {}
        : {
            errors: [
              phase === 'red'
                ? 'RED requires a failing suite, but the suite passed: the test proves nothing.'
                : 'GREEN requires a passing suite, but the suite failed.',
            ],
          }),
    },
  };
}

async function mutateCommand(options: TddOptions): Promise<{ code: number; data?: unknown }> {
  const { projectRoot, command, output } = options;
  if (!options.target || !command) {
    return fail([MUTATE_USAGE]);
  }
  let timeoutMs: number | undefined;
  let maxMutants: number | undefined;
  try {
    timeoutMs = parsePositiveInt(options.timeoutMs, '--timeout-ms');
    maxMutants = parsePositiveInt(options.maxMutants, '--max-mutants');
  } catch (e) {
    return fail([e instanceof Error ? e.message : String(e)]);
  }

  const gated = await runMutationGate(projectRoot, {
    target: options.target,
    testCommand: command,
    allowCompileCheck: options.allowCompileCheck === true,
    timeoutMs,
    maxMutants,
  });
  if (!gated.success) return fail([gated.error.message]);

  if (gated.data.status === 'HANDS_OFF') {
    const { handoverMarkdown, killed, evaluated, totalMutants } = gated.data;
    if (output === 'json') {
      return { code: 2, data: { success: false, command: 'tdd mutate', ...gated.data } };
    }
    return {
      code: 2,
      data: {
        success: false,
        command: 'tdd mutate',
        output: `${handoverMarkdown}\n\nKilled ${killed}/${evaluated} before hands-off (${totalMutants} total).`,
      },
    };
  }

  if (output === 'json') {
    return { code: 0, data: { success: true, command: 'tdd mutate', ...gated.data } };
  }
  const { killed, evaluated, score } = gated.data;
  return {
    code: 0,
    data: {
      success: true,
      command: 'tdd mutate',
      output: `Mutation gate PASS: killed ${killed}/${evaluated} (score ${score}%).`,
    },
  };
}
