#!/usr/bin/env bun
/**
 * Measure revert rate and repeated fix clusters from commit subjects.
 * Not a CI gate — print numbers for a PR; tests use fixtures, not live history.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);
const ROOT = join(import.meta.dir, '..');

export interface CommitRecord {
  readonly subject: string;
  /** Paths touched by the commit; used to cluster fixes that share a route. */
  readonly files?: readonly string[];
}

export interface FixCluster {
  readonly key: string;
  readonly count: number;
  readonly subjects: readonly string[];
}

export interface ReworkReport {
  readonly totalCommits: number;
  readonly revertCount: number;
  readonly revertRate: number;
  readonly fixCount: number;
  readonly clusters: readonly FixCluster[];
}

const REVERT_RE = /^revert(\b|:|\()/i;
const FIX_RE = /^fix(\([^)]*\))?\s*:/i;
const SCOPE_RE = /^fix\(([^)]+)\)\s*:/i;

function clusterKey(commit: CommitRecord): string {
  const scope = commit.subject.match(SCOPE_RE);
  if (scope?.[1]) return scope[1].toLowerCase();
  const files = commit.files ?? [];
  if (files.length > 0) {
    const top = files[0]!.split('/')[0] ?? files[0]!;
    return top.toLowerCase();
  }
  return commit.subject.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 48);
}

/**
 * Analyze commit subjects (and optional paths) for reverts and repeated fixes.
 * A cluster counts once it has two or more fix commits sharing a scope or path root.
 */
export function analyzeRework(commits: readonly CommitRecord[]): ReworkReport {
  const totalCommits = commits.length;
  let revertCount = 0;
  const fixes: CommitRecord[] = [];

  for (const commit of commits) {
    const subject = commit.subject.trim();
    if (REVERT_RE.test(subject)) {
      revertCount += 1;
      continue;
    }
    if (FIX_RE.test(subject)) {
      fixes.push(commit);
    }
  }

  const byKey = new Map<string, string[]>();
  for (const fix of fixes) {
    const key = clusterKey(fix);
    const list = byKey.get(key) ?? [];
    list.push(fix.subject.trim());
    byKey.set(key, list);
  }

  const clusters: FixCluster[] = [...byKey.entries()]
    .filter(([, subjects]) => subjects.length >= 2)
    .map(([key, subjects]) => ({ key, count: subjects.length, subjects }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

  return {
    totalCommits,
    revertCount,
    revertRate: totalCommits === 0 ? 0 : revertCount / totalCommits,
    fixCount: fixes.length,
    clusters,
  };
}

export function formatReworkReport(report: ReworkReport): string {
  const lines = [
    `rework-rate: commits=${report.totalCommits} reverts=${report.revertCount} ` +
      `rate=${(report.revertRate * 100).toFixed(2)}% fixes=${report.fixCount}`,
  ];
  if (report.clusters.length === 0) {
    lines.push('rework-rate: no fix clusters (size >= 2)');
  } else {
    lines.push('rework-rate: fix clusters (size >= 2):');
    for (const cluster of report.clusters) {
      lines.push(`  ${cluster.key}: ${cluster.count}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

/**
 * One-pass live load: subject + files per commit.
 * `git log --pretty=format:%s --name-only` separates commits with a blank line.
 */
export async function loadGitCommitRecords(cwd: string): Promise<CommitRecord[]> {
  const { stdout } = await execFileAsync(
    'git',
    ['log', '--pretty=format:%s', '--name-only'],
    { cwd, encoding: 'utf8', maxBuffer: 40 * 1024 * 1024 },
  );
  const lines = stdout.split('\n');
  const commits: CommitRecord[] = [];
  let subject: string | null = null;
  let files: string[] = [];

  const flush = (): void => {
    if (subject === null) return;
    commits.push({ subject, files });
    subject = null;
    files = [];
  };

  for (const line of lines) {
    if (line === '') {
      flush();
      continue;
    }
    if (subject === null) {
      subject = line;
      files = [];
      continue;
    }
    files.push(line);
  }
  flush();
  return commits;
}

async function main(): Promise<void> {
  const commits = await loadGitCommitRecords(ROOT);
  const report = analyzeRework(commits);
  process.stdout.write(formatReworkReport(report));
}

if (import.meta.main) {
  await main();
}
