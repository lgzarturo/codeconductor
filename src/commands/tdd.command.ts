import { generateAdversarialSuite } from '../core/verification/adversarial-scaffold';
import { runMutationGate } from '../core/verification/mutation-runner';
import { captureTddSuiteEvidence } from '../core/verification/verification-runner';
import { isInside } from '../core/filesystem/path-containment';
import { EdgeCaseSchema } from '../validation/schemas';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
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
  readonly matrix?: string;
  readonly outFile?: string;
}

const USAGE =
  'Usage: tdd capture --task <cardId> --phase red|green --command "<test command>" [--allow-compile-check]';

const MUTATE_USAGE =
  'Usage: tdd mutate --target <file> --command "<test command>" [--allow-compile-check] [--timeout-ms <n>] [--max-mutants <n>]';

const RED_USAGE = 'Usage: tdd red --matrix @matrix.json --out <test file>';

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
  if (subcommand === 'red') {
    return redCommand(options);
  }
  if (subcommand !== 'capture') {
    return fail([`Unknown subcommand: ${subcommand}. ${USAGE} ${MUTATE_USAGE} ${RED_USAGE}`]);
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

async function redCommand(options: TddOptions): Promise<{ code: number; data?: unknown }> {
  const { projectRoot, output } = options;
  if (!options.matrix || !options.outFile) {
    return fail([RED_USAGE]);
  }

  let raw: string;
  try {
    const source = options.matrix.startsWith('@') ? options.matrix.slice(1) : options.matrix;
    const candidate = resolve(projectRoot, source);
    if (!isInside(resolve(projectRoot), candidate)) {
      return fail([`Matrix path escapes the project: ${source}`]);
    }
    raw = await readFile(candidate, 'utf-8');
  } catch {
    return fail([`Cannot read matrix file: ${options.matrix}`]);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fail(['Matrix file is not valid JSON']);
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return fail(['Matrix must be a non-empty array of edge cases']);
  }
  const cases = [];
  for (const [index, entry] of parsed.entries()) {
    const validated = EdgeCaseSchema.safeParse(entry);
    if (!validated.success) {
      return fail([`Matrix entry ${index} is not a valid edge case (scenario/input/expected required)`]);
    }
    cases.push(validated.data);
  }

  const root = resolve(projectRoot);
  const outPath = resolve(root, options.outFile);
  if (!isInside(root, outPath)) {
    return fail([`Output path escapes the project: ${options.outFile}`]);
  }
  try {
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, generateAdversarialSuite(cases), 'utf-8');
  } catch (e) {
    return fail([e instanceof Error ? e.message : String(e)]);
  }

  const summary = `Adversarial RED scaffold: ${cases.length} failing cases → ${options.outFile}`;
  if (output === 'json') {
    return { code: 0, data: { success: true, command: 'tdd red', cases: cases.length, path: outPath } };
  }
  return { code: 0, data: { success: true, command: 'tdd red', output: summary } };
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
