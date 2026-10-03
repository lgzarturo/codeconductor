import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type {
  BacklogDocumentInput,
  OpenspecStateInput,
} from '../../validation/schemas';
import { parseBacklogMarkdown, BACKLOG_FILENAME } from './backlog-parser';
import { validateBacklog, type ValidationReport } from './backlog-validator';
import {
  checkBacklogFileChanged,
  computeScanDiff,
  type ScanDiff,
} from './backlog-scanner';
import { loadOpenspecState } from './openspec-state';
import { err, ok, type Result } from '../../utils/result';

/**
 * Single-read view of the backlog flow: raw markdown, parsed document,
 * persisted state, item diff and validation report. Every handler consumes
 * this instead of re-reading BACKLOG.md.
 */
export interface BacklogSession {
  readonly raw: string;
  readonly doc: BacklogDocumentInput;
  readonly state: OpenspecStateInput;
  readonly scan: ScanDiff;
  readonly report: ValidationReport;
}

/**
 * A session that parsed but did not validate. Carries the document, report
 * and state so reporters (validate, status) can still answer without re-reading.
 */
export class BacklogSessionError extends Error {
  readonly doc: BacklogDocumentInput;
  readonly report: ValidationReport;
  readonly state: OpenspecStateInput;

  constructor(doc: BacklogDocumentInput, report: ValidationReport, state: OpenspecStateInput) {
    super(report.errors.map((e) => e.message).join('; ') || 'Invalid BACKLOG.md');
    this.name = 'BacklogSessionError';
    this.doc = doc;
    this.report = report;
    this.state = state;
  }
}

/**
 * Read, parse, validate and diff BACKLOG.md once, alongside the persisted
 * openspec state. Fails when the file is missing or unparsable (plain Error)
 * or when business validation fails (BacklogSessionError).
 */
export async function loadBacklogSession(
  projectRoot: string
): Promise<Result<BacklogSession, Error>> {
  try {
    const raw = await readFile(resolve(projectRoot, BACKLOG_FILENAME), 'utf-8');
    const parsed = parseBacklogMarkdown(raw);
    if (!parsed.success) return parsed;

    const stateResult = await loadOpenspecState(projectRoot);
    if (!stateResult.success) return stateResult;
    const state = stateResult.data;

    const report = validateBacklog(parsed.data);
    if (!report.valid) {
      return err(new BacklogSessionError(parsed.data, report, state));
    }

    return ok({
      raw,
      doc: parsed.data,
      state,
      scan: computeScanDiff(
        raw,
        parsed.data,
        state.itemSnapshots ?? {},
        checkBacklogFileChanged(projectRoot)
      ),
      report,
    });
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}
