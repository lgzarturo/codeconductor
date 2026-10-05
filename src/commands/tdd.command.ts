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
}

const USAGE =
  'Usage: tdd capture --task <cardId> --phase red|green --command "<test command>" [--allow-compile-check]';

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
  if (subcommand !== 'capture') {
    return fail([`Unknown subcommand: ${subcommand}. ${USAGE}`]);
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
