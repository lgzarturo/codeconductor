import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { assessSpecMarkdown, type SpecQualityReport } from './spec-quality';

export type AnalyzeSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface SpecAnalyzeFinding {
  readonly severity: AnalyzeSeverity;
  readonly code: string;
  readonly message: string;
}

export interface SpecAnalyzeReport {
  readonly changePath: string;
  readonly frIds: string[];
  readonly scIds: string[];
  readonly mappedFr: string[];
  readonly mappedSc: string[];
  readonly mappedToTests: string[];
  readonly frCoveragePct: number;
  readonly scCoveragePct: number;
  readonly testCoveragePct: number;
  readonly findings: SpecAnalyzeFinding[];
  readonly stop: boolean;
  readonly quality: SpecQualityReport;
}

export interface AnalyzeArtifactsInput {
  readonly changePath: string;
  readonly specMarkdown: string;
  readonly tasksMarkdown: string;
  readonly designMarkdown?: string;
  readonly policyText?: string;
  readonly tddRequired: boolean;
  readonly hasTddEvidence?: boolean;
}

function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}

function extractIds(pattern: RegExp, text: string): string[] {
  return unique(text.match(pattern) ?? []);
}

function coverage(mapped: number, total: number): number {
  if (total === 0) return 100;
  return Math.round((mapped / total) * 1000) / 10;
}

function mentionsId(haystack: string, id: string): boolean {
  return haystack.includes(id);
}

function testSection(tasksMarkdown: string): string {
  const lines = tasksMarkdown.split('\n');
  const kept: string[] = [];
  for (const line of lines) {
    if (/\btest\b|TDD|RED|suite/i.test(line)) {
      kept.push(line);
    }
  }
  return kept.join('\n');
}

async function readDeltaSpecs(specDir: string): Promise<string> {
  let entries;
  try {
    entries = await readdir(specDir, { withFileTypes: true });
  } catch {
    return '';
  }
  const contents: string[] = [];
  for (const entry of entries) {
    const path = join(specDir, entry.name);
    if (entry.isDirectory()) {
      contents.push(await readDeltaSpecs(path));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      contents.push(await readFile(path, 'utf-8'));
    }
  }
  return contents.filter(Boolean).join('\n\n');
}

/**
 * Read-only coverage of FR/SC → tasks → tests. Does not write files.
 */
export function analyzeSpecArtifacts(input: AnalyzeArtifactsInput): SpecAnalyzeReport {
  const quality = assessSpecMarkdown(input.specMarkdown, `${input.changePath}/specs`);
  const frIds = unique(quality.requirements.map((r) => r.id));
  const scIds = unique(quality.successCriteria.map((s) => s.id));
  const tasks = input.tasksMarkdown;
  const testTasks = testSection(tasks);

  const mappedFr = frIds.filter((id) => mentionsId(tasks, id));
  const mappedSc = scIds.filter((id) => mentionsId(tasks, id));
  const mappedToTests = frIds.filter((id) => mentionsId(testTasks, id));

  const findings: SpecAnalyzeFinding[] = [];

  for (const issue of quality.issues.filter((i) => i.severity === 'error')) {
    findings.push({
      severity: 'CRITICAL',
      code: issue.code,
      message: issue.message,
    });
  }

  if (input.tddRequired) {
    for (const id of frIds) {
      if (!mappedToTests.includes(id)) {
        findings.push({
          severity: 'CRITICAL',
          code: 'TDD_FR_UNTESTED',
          message: `${id} has no test task while TDD required is yes`,
        });
      }
    }
    if (input.hasTddEvidence === false && frIds.length > 0) {
      findings.push({
        severity: 'HIGH',
        code: 'TDD_EVIDENCE_MISSING',
        message: 'TDD required but no verification-runner suite evidence was found',
      });
    }
  }

  const policy = input.policyText ?? '';
  const design = input.designMarkdown ?? '';
  if (/\bMUST\b/.test(policy) && /skip TDD|ignore AGENTS|bypass review/i.test(design)) {
    findings.push({
      severity: 'CRITICAL',
      code: 'POLICY_CONFLICT',
      message: 'design.md conflicts with a MUST in AGENTS.md / BACKLOG Global',
    });
  }

  if (quality.stopForClarify) {
    findings.push({
      severity: 'HIGH',
      code: 'NEEDS_CLARIFICATION',
      message: 'Spec has [NEEDS CLARIFICATION] markers — run ccep evaluate and stop',
    });
  }

  const frCoveragePct = coverage(mappedFr.length, frIds.length);
  const scCoveragePct = coverage(mappedSc.length, scIds.length);
  const testCoveragePct = coverage(mappedToTests.length, frIds.length);
  const stop = findings.some((f) => f.severity === 'CRITICAL');

  return {
    changePath: input.changePath,
    frIds,
    scIds,
    mappedFr,
    mappedSc,
    mappedToTests,
    frCoveragePct,
    scCoveragePct,
    testCoveragePct,
    findings,
    stop,
    quality,
  };
}

export async function analyzeChangeFolder(
  projectRoot: string,
  changePath: string,
  options: {
    tddRequired: boolean;
    policyText?: string;
    hasTddEvidence?: boolean;
  },
): Promise<SpecAnalyzeReport> {
  const changeRoot = resolve(projectRoot, changePath);
  const specMarkdown = await readDeltaSpecs(join(changeRoot, 'specs'));
  let tasksMarkdown = '';
  try {
    tasksMarkdown = await readFile(join(changeRoot, 'tasks.md'), 'utf-8');
  } catch {
    tasksMarkdown = '';
  }
  let designMarkdown: string | undefined;
  try {
    designMarkdown = await readFile(join(changeRoot, 'design.md'), 'utf-8');
  } catch {
    designMarkdown = undefined;
  }

  return analyzeSpecArtifacts({
    changePath,
    specMarkdown,
    tasksMarkdown,
    designMarkdown,
    policyText: options.policyText,
    tddRequired: options.tddRequired,
    hasTddEvidence: options.hasTddEvidence,
  });
}

export function extractIdsFromText(text: string): { fr: string[]; sc: string[] } {
  return {
    fr: extractIds(/\bFR-\d{3}\b/g, text),
    sc: extractIds(/\bSC-\d{3}\b/g, text),
  };
}
