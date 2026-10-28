/**
 * Final A/B report (T-034). Missing metrics stay null — never 0 / guessed.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { summarize, wilsonInterval, type WilsonInterval } from '../bench/stats';

export type AbArmId = 'sin-arnes' | 'con-arnes';

export interface AbRunCell {
  taskId: string;
  arm: AbArmId;
  repetition: number;
  /** Objective oracle (test pass/fail). null when not finished. */
  success: boolean | null;
  finished: boolean;
  tokensIn: number | null;
  tokensOut: number | null;
  requests: number | null;
  iterations: number | null;
  retries: number | null;
  durationMs: number | null;
  error: string | null;
}

export type AbVerdict = 'el arnés ayudó' | 'el arnés no ayudó' | 'no concluyente';

export interface AbArmSummary {
  arm: AbArmId;
  nFinished: number;
  nSuccess: number;
  successRate: number | null;
  successWilson: WilsonInterval | null;
  tokensInMedian: number | null;
  tokensOutMedian: number | null;
  durationMsMedian: number | null;
  requestsTotal: number | null;
  failures: number;
  retriesTotal: number | null;
}

export interface AbFinalReport {
  schema: 'codeconductor-ab/v1';
  generatedAt: string;
  provider: string;
  modelId: string;
  maxTurns: number;
  requestCap: number;
  requestCount: number | null;
  capReached: boolean;
  cost: {
    label: 'real' | 'estimado' | 'desconocido';
    usageDeltaUsd: number | null;
  };
  arms: AbArmSummary[];
  cells: AbRunCell[];
  verdict: AbVerdict;
  verdictRule: string;
  harnessHelped: boolean | null;
  notes: string[];
}

function armCells(cells: AbRunCell[], arm: AbArmId): AbRunCell[] {
  return cells.filter((c) => c.arm === arm);
}

function summarizeArm(cells: AbRunCell[], arm: AbArmId): AbArmSummary {
  const mine = armCells(cells, arm);
  const finished = mine.filter((c) => c.finished && c.success !== null);
  const nSuccess = finished.filter((c) => c.success === true).length;
  const nFinished = finished.length;
  const tokensIn = finished
    .map((c) => c.tokensIn)
    .filter((v): v is number => typeof v === 'number');
  const tokensOut = finished
    .map((c) => c.tokensOut)
    .filter((v): v is number => typeof v === 'number');
  const durations = finished
    .map((c) => c.durationMs)
    .filter((v): v is number => typeof v === 'number');
  const reqs = mine
    .map((c) => c.requests)
    .filter((v): v is number => typeof v === 'number');
  const retries = mine
    .map((c) => c.retries)
    .filter((v): v is number => typeof v === 'number');
  return {
    arm,
    nFinished,
    nSuccess,
    successRate: nFinished > 0 ? nSuccess / nFinished : null,
    successWilson: nFinished > 0 ? wilsonInterval(nSuccess, nFinished) : null,
    tokensInMedian: summarize(tokensIn).median,
    tokensOutMedian: summarize(tokensOut).median,
    durationMsMedian: summarize(durations).median,
    requestsTotal: reqs.length > 0 ? reqs.reduce((a, b) => a + b, 0) : null,
    failures: finished.filter((c) => c.success === false).length,
    retriesTotal: retries.length > 0 ? retries.reduce((a, b) => a + b, 0) : null,
  };
}

/**
 * Verdict rule (written into the report):
 * - Need ≥5 finished cells per arm; else no concluyente.
 * - Compare Wilson 95% intervals on success rate.
 * - Helped iff treatment.low > baseline.high.
 * - Did not help iff treatment.high < baseline.low.
 * - Otherwise no concluyente (incl. overlapping CIs / low N).
 */
export function decideAbVerdict(
  sin: AbArmSummary,
  con: AbArmSummary,
): { verdict: AbVerdict; harnessHelped: boolean | null; rule: string } {
  const rule =
    'N≥5 finished/arm; helped iff Wilson95(con).low > Wilson95(sin).high; ' +
    'no ayudó iff Wilson95(con).high < Wilson95(sin).low; else no concluyente';
  if (sin.nFinished < 5 || con.nFinished < 5 || !sin.successWilson || !con.successWilson) {
    return { verdict: 'no concluyente', harnessHelped: null, rule };
  }
  if (con.successWilson.low > sin.successWilson.high) {
    return { verdict: 'el arnés ayudó', harnessHelped: true, rule };
  }
  if (con.successWilson.high < sin.successWilson.low) {
    return { verdict: 'el arnés no ayudó', harnessHelped: false, rule };
  }
  return { verdict: 'no concluyente', harnessHelped: null, rule };
}

export function buildAbReport(input: {
  provider: string;
  modelId: string;
  maxTurns: number;
  requestCap: number;
  requestCount: number | null;
  capReached: boolean;
  usageDeltaUsd: number | null;
  costLabel: 'real' | 'estimado' | 'desconocido';
  cells: AbRunCell[];
  notes?: string[];
}): AbFinalReport {
  const sin = summarizeArm(input.cells, 'sin-arnes');
  const con = summarizeArm(input.cells, 'con-arnes');
  const { verdict, harnessHelped, rule } = decideAbVerdict(sin, con);
  const notes = [...(input.notes ?? [])];
  if (input.capReached) notes.push('tope alcanzado');
  return {
    schema: 'codeconductor-ab/v1',
    generatedAt: new Date().toISOString(),
    provider: input.provider,
    modelId: input.modelId,
    maxTurns: input.maxTurns,
    requestCap: input.requestCap,
    requestCount: input.requestCount,
    capReached: input.capReached,
    cost: {
      label: input.costLabel,
      usageDeltaUsd: input.usageDeltaUsd,
    },
    arms: [sin, con],
    cells: input.cells,
    verdict,
    verdictRule: rule,
    harnessHelped,
    notes,
  };
}

export function formatAbReportMarkdown(report: AbFinalReport): string {
  const lines: string[] = [
    '# CodeConductor A/B report (T-034)',
    '',
    `Generated: ${report.generatedAt}`,
    `Provider: \`${report.provider}\` · model: \`${report.modelId}\` · maxTurns: ${report.maxTurns}`,
    `Requests: ${report.requestCount ?? 'null'} / ${report.requestCap}` +
      (report.capReached ? ' · **tope alcanzado**' : ''),
    `Cost (${report.cost.label}): ${report.cost.usageDeltaUsd ?? 'null'}`,
    '',
    `## Verdict: **${report.verdict}**`,
    '',
    `Rule: ${report.verdictRule}`,
    '',
    '| Arm | Success | Tokens in (med) | Tokens out (med) | Duration ms (med) | Failures | Retries |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const a of report.arms) {
    const rate =
      a.successRate === null ? 'null' : `${a.nSuccess}/${a.nFinished} (${(a.successRate * 100).toFixed(0)}%)`;
    lines.push(
      `| ${a.arm} | ${rate} | ${a.tokensInMedian ?? 'null'} | ${a.tokensOutMedian ?? 'null'} | ${a.durationMsMedian ?? 'null'} | ${a.failures} | ${a.retriesTotal ?? 'null'} |`,
    );
  }
  if (report.notes.length > 0) {
    lines.push('', '## Notes', ...report.notes.map((n) => `- ${n}`));
  }
  lines.push('');
  return lines.join('\n');
}

export async function writeAbReport(
  outDir: string,
  report: AbFinalReport,
): Promise<{ jsonPath: string; mdPath: string }> {
  await mkdir(outDir, { recursive: true });
  const jsonPath = join(outDir, 'ab-report.json');
  const mdPath = join(outDir, 'ab-report.md');
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  await writeFile(mdPath, formatAbReportMarkdown(report), 'utf-8');
  return { jsonPath, mdPath };
}
