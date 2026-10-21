/**
 * TS mutation gate — same contract as presets/shared/mutation_runner.py:
 * one syntactic mutant at a time, suite re-run per mutant, unconditional
 * rollback. Killed = suite fails or times out; survived = HANDS_OFF with
 * survivor evidence and a handoff for the tester.
 *
 * Operator detection is line-based with string/comment masking (same
 * heuristic standard as the symbol scanner); multi-line template literals
 * or block comments may leak edge cases.
 */

import { readFile, writeFile } from 'node:fs/promises';
import {
  isAllowlistedTestCommand,
  runCompileCheck,
} from '../compilation/compile-checker';
import { resolveWithinRoot } from '../filesystem/path-containment';
import { err, ok, type Result } from '../../utils/result';

export interface Mutant {
  readonly id: string;
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly originalOp: string;
  readonly mutatedOp: string;
}

export interface SurvivorRecord extends Mutant {
  readonly diff: string;
}

export type MutationGateResult =
  | {
      readonly status: 'PASS';
      readonly totalMutants: number;
      readonly evaluated: number;
      readonly killed: number;
      readonly timeouts: number;
      readonly score: number;
    }
  | {
      readonly status: 'HANDS_OFF';
      readonly totalMutants: number;
      readonly evaluated: number;
      readonly killed: number;
      readonly timeouts: number;
      readonly survivor: SurvivorRecord;
      readonly handoverMarkdown: string;
    };

export interface MutationGateOptions {
  readonly target: string;
  readonly testCommand: string;
  readonly allowCompileCheck?: boolean;
  readonly timeoutMs?: number;
  readonly maxMutants?: number;
}

const DEFAULT_TIMEOUT_MS = 60_000;

interface OpRule {
  readonly from: string;
  readonly to: string;
  /** Skip when the previous char is in this set. */
  readonly prevBan?: string;
  /** Skip when the next char is in this set. */
  readonly nextBan?: string;
  readonly word?: boolean;
}

/** Longest match wins at each position; order below is declaration only. */
const OP_RULES: readonly OpRule[] = [
  { from: '===', to: '!==' },
  { from: '!==', to: '===' },
  { from: '&&', to: '||' },
  { from: '||', to: '&&' },
  { from: '==', to: '!=' },
  { from: '!=', to: '==' },
  { from: '>=', to: '<' },
  { from: '<=', to: '>' },
  { from: '>', to: '<=', prevBan: '><=!-/', nextBan: '></=/' },
  { from: '<', to: '>=', prevBan: '><=!-/', nextBan: '></=/' },
  { from: '+', to: '-', prevBan: '+-=', nextBan: '+-=' },
  { from: '-', to: '+', prevBan: '+-=', nextBan: '+-=>' },
  { from: 'true', to: 'false', word: true },
  { from: 'false', to: 'true', word: true },
];

const RULES_BY_LENGTH = [...OP_RULES].sort((a, b) => b.from.length - a.from.length);

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[\w$]/.test(ch);
}

interface MaskedSpan {
  readonly start: number;
  readonly end: number;
}

function maskedSpans(line: string): MaskedSpan[] {
  const spans: MaskedSpan[] = [];
  const pushString = (quote: string): void => {
    let i = 0;
    while (i < line.length) {
      const open = line.indexOf(quote, i);
      if (open < 0) break;
      let close = open + 1;
      while (close < line.length) {
        if (line[close] === '\\') {
          close += 2;
          continue;
        }
        if (line[close] === quote) break;
        close++;
      }
      spans.push({ start: open, end: Math.min(close + 1, line.length) });
      i = close + 1;
    }
  };
  pushString("'");
  pushString('"');
  pushString('`');
  const lineComment = line.indexOf('//');
  // Avoid mistaking URL schemes (http://) for comments: require the // to
  // start the comment only when not preceded by a word char and colon.
  if (lineComment >= 0 && !/[\w$]:$/.test(line.slice(0, lineComment))) {
    spans.push({ start: lineComment, end: line.length });
  }
  const blockOpen = line.indexOf('/*');
  if (blockOpen >= 0) {
    const blockClose = line.indexOf('*/', blockOpen + 2);
    spans.push({ start: blockOpen, end: blockClose >= 0 ? blockClose + 2 : line.length });
  }
  return spans;
}

function isMasked(spans: readonly MaskedSpan[], index: number, length: number): boolean {
  return spans.some((span) => index < span.end && index + length > span.start);
}

export function generateMutants(source: string, file: string): Mutant[] {
  const mutants: Mutant[] = [];
  const lines = source.split('\n');
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx]!;
    const spans = maskedSpans(line);
    let col = 0;
    while (col < line.length) {
      const rule = RULES_BY_LENGTH.find(
        (candidate) =>
          line.startsWith(candidate.from, col) &&
          !isMasked(spans, col, candidate.from.length) &&
          (candidate.prevBan === undefined || !candidate.prevBan.includes(line[col - 1] ?? '')) &&
          (candidate.nextBan === undefined ||
            !candidate.nextBan.includes(line[col + candidate.from.length] ?? '')) &&
          (candidate.word !== true ||
            (!isWordChar(line[col - 1]) && !isWordChar(line[col + candidate.from.length]))),
      );
      if (rule) {
        const id = `MUT_${String(mutants.length).padStart(3, '0')}_L${lineIdx + 1}`;
        mutants.push({
          id,
          file,
          line: lineIdx + 1,
          column: col,
          originalOp: rule.from,
          mutatedOp: rule.to,
        });
        col += rule.from.length;
      } else {
        col++;
      }
    }
  }
  return mutants;
}

function applyMutant(source: string, mutant: Mutant): string {
  const lines = source.split('\n');
  const line = lines[mutant.line - 1] ?? '';
  const actual = line.slice(mutant.column, mutant.column + mutant.originalOp.length);
  if (actual !== mutant.originalOp) {
    throw new Error(`Mutant ${mutant.id} does not match source at ${mutant.line}:${mutant.column}`);
  }
  lines[mutant.line - 1] =
    line.slice(0, mutant.column) + mutant.mutatedOp + line.slice(mutant.column + mutant.originalOp.length);
  return lines.join('\n');
}

function mutantDiff(source: string, mutated: string, line: number): string {
  const before = source.split('\n')[line - 1] ?? '';
  const after = mutated.split('\n')[line - 1] ?? '';
  return `@@ line ${line}\n- ${before}\n+ ${after}`;
}

function handoverMarkdown(target: string, survivor: SurvivorRecord): string {
  return [
    '## Mutation Gate: Survivor Detected (TDD Gap)',
    `- **Target File**: \`${target}\``,
    `- **Line**: ${survivor.line}`,
    `- **Mutant ID**: \`${survivor.id}\``,
    `- **Operator Change**: \`${survivor.originalOp}\` -> \`${survivor.mutatedOp}\``,
    '- **Status**: SURVIVED (Scorecard Real Coverage: 0)',
    '',
    '### Reproduction Diff',
    '```diff',
    survivor.diff,
    '```',
    '',
    '### Action Required',
    '',
    '1. Do NOT touch production implementation.',
    '2. Write a minimal failing test (TDD Law 1 & 2) that asserts this branch.',
    '3. Verify the test turns red before re-verifying production code.',
  ].join('\n');
}

export async function runMutationGate(
  projectRoot: string,
  options: MutationGateOptions,
): Promise<Result<MutationGateResult, Error>> {
  if (!options.allowCompileCheck && !isAllowlistedTestCommand(options.testCommand)) {
    return err(
      new Error(
        'Mutation test command is not on the test allowlist. Re-run with --allow-compile-check to trust it.',
      ),
    );
  }

  let canonicalTarget: string | undefined;
  try {
    canonicalTarget = await resolveWithinRoot(projectRoot, options.target);
  } catch {
    canonicalTarget = undefined;
  }
  if (canonicalTarget === undefined) {
    return err(new Error(`Mutation target is not a readable file inside the project: ${options.target}`));
  }
  let originalSource: string;
  try {
    originalSource = await readFile(canonicalTarget, 'utf-8');
  } catch {
    return err(new Error(`Mutation target is not readable: ${options.target}`));
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const allMutants = generateMutants(originalSource, options.target);
  const mutants =
    options.maxMutants !== undefined ? allMutants.slice(0, Math.max(0, options.maxMutants)) : allMutants;

  const preflight = await runCompileCheck({ command: options.testCommand, cwd: projectRoot, timeoutMs });
  if (!preflight.success) {
    return err(
      new Error(
        `The test suite is already failing on unmutated base code (exit ${preflight.exitCode}${preflight.timedOut ? ', timed out' : ''}).`,
      ),
    );
  }

  if (mutants.length === 0) {
    return ok({ status: 'PASS', totalMutants: 0, evaluated: 0, killed: 0, timeouts: 0, score: 100 });
  }

  let killed = 0;
  let timeouts = 0;
  try {
    for (const mutant of mutants) {
      const mutatedSource = applyMutant(originalSource, mutant);
      await writeFile(canonicalTarget, mutatedSource, 'utf-8');
      const run = await runCompileCheck({ command: options.testCommand, cwd: projectRoot, timeoutMs });
      if (run.timedOut) timeouts++;
      if (!run.success) {
        killed++;
        continue;
      }
      const survivor: SurvivorRecord = {
        ...mutant,
        diff: mutantDiff(originalSource, mutatedSource, mutant.line),
      };
      return ok({
        status: 'HANDS_OFF',
        totalMutants: allMutants.length,
        evaluated: killed + 1,
        killed,
        timeouts,
        survivor,
        handoverMarkdown: handoverMarkdown(options.target, survivor),
      });
    }
  } finally {
    await writeFile(canonicalTarget, originalSource, 'utf-8');
  }

  const evaluated = mutants.length;
  return ok({
    status: 'PASS',
    totalMutants: allMutants.length,
    evaluated,
    killed,
    timeouts,
    score: evaluated === 0 ? 100 : Math.round((killed / evaluated) * 10000) / 100,
  });
}
