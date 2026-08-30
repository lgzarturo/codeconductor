import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const RFC2119 = /\b(MUST(?: NOT)?|SHALL(?: NOT)?|SHOULD(?: NOT)?|MAY)\b/;
const FR_ID = /\bFR-\d{3}\b/g;
const SC_ID = /\bSC-\d{3}\b/g;
const US_AC = /\b(?:US|AC)#?\d+\b/g;
const GWT =
  /\bGIVEN\b[\s\S]{0,400}\bWHEN\b[\s\S]{0,400}\bTHEN\b/i;
const NEEDS_CLARIFICATION = /\[NEEDS CLARIFICATION:[^\]]*\]/gi;
const PLACEHOLDER = /\(To be completed/i;
const HOW_LEAK =
  /\b(TypeScript|PostgreSQL|Django|React|Spring Boot|package\.json|implements class)\b/i;
const MAX_CLARIFICATIONS = 3;

export interface SpecQualityIssue {
  readonly code: string;
  readonly message: string;
  readonly path: string;
  readonly severity: 'error' | 'warning';
}

export interface SpecRequirement {
  readonly id: string;
  readonly text: string;
}

export interface SpecQualityReport {
  readonly valid: boolean;
  readonly needsClarificationCount: number;
  readonly stopForClarify: boolean;
  readonly issues: SpecQualityIssue[];
  readonly requirements: SpecRequirement[];
  readonly successCriteria: SpecRequirement[];
}

function uniqueIds(matches: RegExpMatchArray | null): string[] {
  return [...new Set(matches ?? [])];
}

function requirementBlocks(content: string): string[] {
  const parts = content.split(/^### Requirement:/m);
  return parts.slice(1).map((block) => `### Requirement:${block}`);
}

export function assessSpecMarkdown(content: string, path: string): SpecQualityReport {
  const issues: SpecQualityIssue[] = [];
  const clarifications = content.match(NEEDS_CLARIFICATION) ?? [];
  const needsClarificationCount = clarifications.length;
  const frIds = uniqueIds(content.match(FR_ID));
  const scIds = uniqueIds(content.match(SC_ID));
  const usAcIds = uniqueIds(content.match(US_AC));
  const hasTraceIds = frIds.length > 0 && (scIds.length > 0 || usAcIds.length > 0);

  if (PLACEHOLDER.test(content)) {
    issues.push({
      code: 'PLACEHOLDER',
      message: 'Spec still contains a "(To be completed" placeholder',
      path,
      severity: 'error',
    });
  }

  if (needsClarificationCount > MAX_CLARIFICATIONS) {
    issues.push({
      code: 'TOO_MANY_CLARIFICATIONS',
      message: `Found ${needsClarificationCount} [NEEDS CLARIFICATION] markers (max ${MAX_CLARIFICATIONS})`,
      path,
      severity: 'error',
    });
  }

  if (!hasTraceIds) {
    issues.push({
      code: 'MISSING_TRACE_IDS',
      message: 'Spec MUST include FR-### identifiers and SC-### (or US#/AC#) success criteria',
      path,
      severity: 'error',
    });
  }

  const blocks = requirementBlocks(content);
  if (blocks.length === 0) {
    issues.push({
      code: 'MISSING_REQUIREMENT',
      message: 'Spec MUST include at least one "### Requirement:" block',
      path,
      severity: 'error',
    });
  }

  for (const block of blocks) {
    const heading = block.split('\n', 1)[0] ?? '';
    if (!RFC2119.test(block)) {
      issues.push({
        code: 'MISSING_RFC2119',
        message: `Requirement "${heading}" MUST use RFC 2119 keywords (MUST/SHALL/SHOULD/MAY)`,
        path,
        severity: 'error',
      });
    }
    if (!GWT.test(block)) {
      issues.push({
        code: 'MISSING_GWT',
        message: `Requirement "${heading}" MUST include a Given/When/Then scenario`,
        path,
        severity: 'error',
      });
    }
  }

  if (HOW_LEAK.test(content) && /specs[/\\]/.test(path.replace(/\\/g, '/'))) {
    issues.push({
      code: 'HOW_IN_SPEC',
      message: 'Spec describes stack/HOW details; keep WHAT here and HOW in design.md',
      path,
      severity: 'warning',
    });
  }

  const requirements = frIds.map((id) => ({ id, text: id }));
  const successCriteria = [...scIds, ...usAcIds].map((id) => ({ id, text: id }));
  const errors = issues.filter((i) => i.severity === 'error');

  return {
    valid: errors.length === 0,
    needsClarificationCount,
    stopForClarify:
      needsClarificationCount > 0 && needsClarificationCount <= MAX_CLARIFICATIONS,
    issues,
    requirements,
    successCriteria,
  };
}

export function mergeSpecQualityReports(reports: SpecQualityReport[]): SpecQualityReport {
  if (reports.length === 0) {
    return {
      valid: true,
      needsClarificationCount: 0,
      stopForClarify: false,
      issues: [],
      requirements: [],
      successCriteria: [],
    };
  }
  const issues = reports.flatMap((r) => r.issues);
  const requirements = reports.flatMap((r) => r.requirements);
  const successCriteria = reports.flatMap((r) => r.successCriteria);
  const needsClarificationCount = reports.reduce(
    (sum, r) => sum + r.needsClarificationCount,
    0,
  );
  return {
    valid: issues.every((i) => i.severity !== 'error'),
    needsClarificationCount,
    stopForClarify:
      needsClarificationCount > 0 && needsClarificationCount <= MAX_CLARIFICATIONS,
    issues,
    requirements,
    successCriteria,
  };
}

async function walkMarkdown(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walkMarkdown(full)));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Validate spec artifacts in an OpenSpec change folder.
 * Only `specs/**` are fail-closed for FR/SC/GWT. proposal/design still
 * fail on leftover placeholders.
 */
export async function assessChangeFolder(
  projectRoot: string,
  changePath: string,
): Promise<SpecQualityReport> {
  const root = resolve(projectRoot);
  const changeRoot = resolve(root, changePath);
  if (!changeRoot.startsWith(root)) {
    return {
      valid: false,
      needsClarificationCount: 0,
      stopForClarify: false,
      issues: [
        {
          code: 'PATH_ESCAPE',
          message: 'Change path escapes the project root',
          path: changePath,
          severity: 'error',
        },
      ],
      requirements: [],
      successCriteria: [],
    };
  }

  const specDir = join(changeRoot, 'specs');
  const specFiles = await walkMarkdown(specDir);
  const extra = ['proposal.md', 'design.md'].map((name) => join(changeRoot, name));
  const reports: SpecQualityReport[] = [];

  for (const file of specFiles) {
    const content = await readFile(file, 'utf-8');
    reports.push(assessSpecMarkdown(content, relative(root, file).replace(/\\/g, '/')));
  }

  for (const file of extra) {
    let content: string;
    try {
      content = await readFile(file, 'utf-8');
    } catch {
      continue;
    }
    const rel = relative(root, file).replace(/\\/g, '/');
    if (PLACEHOLDER.test(content)) {
      reports.push({
        valid: false,
        needsClarificationCount: 0,
        stopForClarify: false,
        issues: [
          {
            code: 'PLACEHOLDER',
            message: 'Artifact still contains a "(To be completed" placeholder',
            path: rel,
            severity: 'error',
          },
        ],
        requirements: [],
        successCriteria: [],
      });
    }
  }

  if (specFiles.length === 0) {
    reports.push({
      valid: false,
      needsClarificationCount: 0,
      stopForClarify: false,
      issues: [
        {
          code: 'MISSING_SPEC',
          message: 'Change folder has no specs/*.md artifacts',
          path: `${changePath.replace(/\\/g, '/')}/specs`,
          severity: 'error',
        },
      ],
      requirements: [],
      successCriteria: [],
    });
  }

  return mergeSpecQualityReports(reports);
}
