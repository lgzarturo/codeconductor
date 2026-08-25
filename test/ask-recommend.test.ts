import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  ASK_FLOW_CATALOG,
  recommendAskFlow,
} from '../src/core/ask/recommend-flow';

const ROOT = resolve(import.meta.dir, '..');

describe('recommendAskFlow', () => {
  test('maps a natural-language bug report to /cc:fix with a reason', () => {
    const rec = recommendAskFlow('login fails with 500 after deploy');
    expect(rec.command).toBe('fix');
    expect(rec.slash).toBe('/cc:fix');
    expect(rec.reason.length).toBeGreaterThan(10);
  });

  test('maps new product work to /cc:feature', () => {
    const rec = recommendAskFlow('add invoice export to CSV');
    expect(rec.command).toBe('feature');
    expect(rec.slash).toBe('/cc:feature');
    expect(rec.reason.length).toBeGreaterThan(10);
  });

  test('maps cleanup without new behavior to /cc:refactor', () => {
    const rec = recommendAskFlow('extract duplicated parser helpers, no behavior change');
    expect(rec.command).toBe('refactor');
    expect(rec.slash).toBe('/cc:refactor');
  });

  test('maps a PR review request to /cc:review', () => {
    const rec = recommendAskFlow('please review this pull request before merge');
    expect(rec.command).toBe('review');
    expect(rec.slash).toBe('/cc:review');
  });

  test('maps red-green TDD intent to /cc:tdd-cycle', () => {
    const rec = recommendAskFlow('write a failing test first then implement');
    expect(rec.command).toBe('tdd-cycle');
    expect(rec.slash).toBe('/cc:tdd-cycle');
  });

  test('maps backlog delivery to /cc:openspec', () => {
    const rec = recommendAskFlow('deliver the next BC-004 tracer bullet from BACKLOG.md');
    expect(rec.command).toBe('openspec');
    expect(rec.slash).toBe('/cc:openspec');
  });

  test('does not execute a workflow — only returns a recommendation', () => {
    const rec = recommendAskFlow('the build is broken');
    expect(rec).not.toHaveProperty('executed');
    expect(Object.keys(rec).sort()).toEqual(['command', 'reason', 'slash']);
  });
});

describe('ASK_FLOW_CATALOG stays aligned with shipped slash commands', () => {
  test('every catalog id has a claude command file', () => {
    expect(ASK_FLOW_CATALOG.map((f) => f.command)).toEqual([
      'feature',
      'fix',
      'refactor',
      'review',
      'tdd-cycle',
      'openspec',
    ]);
    for (const flow of ASK_FLOW_CATALOG) {
      expect(
        existsSync(join(ROOT, 'presets/claude/commands/cc', `${flow.command}.md`)),
      ).toBe(true);
    }
  });
});
