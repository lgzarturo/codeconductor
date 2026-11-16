import { describe, expect, test } from 'bun:test';
import {
  analyzeRework,
  formatReworkReport,
  type CommitRecord,
} from '../../../scripts/rework-rate';

describe('analyzeRework', () => {
  test('reports zero revert rate and empty clusters on a clean fixture', () => {
    const commits: CommitRecord[] = [
      { subject: 'feat(cli): add ask router' },
      { subject: 'docs: changelog for 1.8.0' },
      { subject: 'chore(release): bump to v1.8.0' },
    ];
    const report = analyzeRework(commits);
    expect(report.totalCommits).toBe(3);
    expect(report.revertCount).toBe(0);
    expect(report.revertRate).toBe(0);
    expect(report.fixCount).toBe(0);
    expect(report.clusters).toEqual([]);
  });

  test('counts reverts and clusters repeated fixes that share a scope', () => {
    const commits: CommitRecord[] = [
      { subject: 'feat(telemetry): add proxy' },
      { subject: 'fix(telemetry): pin Claude Code version' },
      { subject: 'fix(telemetry): hard-cap live bench' },
      { subject: 'fix(hooks): use absolute paths for global Claude hooks' },
      { subject: 'fix(hooks): normalize global hook paths to forward slashes' },
      { subject: 'fix(hooks): shell-safe quoting for global Claude hook paths' },
      { subject: 'Revert "feat(telemetry): add proxy"' },
      { subject: 'feat(presets): ship consumer CLI wording' },
    ];
    const report = analyzeRework(commits);
    expect(report.totalCommits).toBe(8);
    expect(report.revertCount).toBe(1);
    expect(report.revertRate).toBeCloseTo(1 / 8);
    expect(report.fixCount).toBe(5);
    expect(report.clusters.map((c) => c.key)).toEqual(['hooks', 'telemetry']);
    expect(report.clusters.find((c) => c.key === 'hooks')?.count).toBe(3);
    expect(report.clusters.find((c) => c.key === 'telemetry')?.count).toBe(2);
  });

  test('clusters fixes by shared path root when scope is missing', () => {
    const commits: CommitRecord[] = [
      {
        subject: 'fix: restore council redirect stub',
        files: ['presets/codex/skills/cc-council/SKILL.md'],
      },
      {
        subject: 'fix: regenerate council stub after sync',
        files: ['presets/cursor/commands/cc/council.md'],
      },
      {
        subject: 'fix: unrelated one-off',
        files: ['src/cli/main.ts'],
      },
    ];
    const report = analyzeRework(commits);
    expect(report.fixCount).toBe(3);
    expect(report.clusters).toEqual([
      {
        key: 'presets',
        count: 2,
        subjects: [
          'fix: restore council redirect stub',
          'fix: regenerate council stub after sync',
        ],
      },
    ]);
  });

  test('formatReworkReport prints rate and clusters', () => {
    const text = formatReworkReport(
      analyzeRework([
        { subject: 'fix(skills): restore stub' },
        { subject: 'fix(skills): normalize names' },
      ]),
    );
    expect(text).toContain('reverts=0');
    expect(text).toContain('skills: 2');
  });
});
