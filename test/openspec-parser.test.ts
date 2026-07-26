/**
 * Tests for backlog parser and validator.
 */
import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseBacklogMarkdown, loadBacklog } from '../src/core/openspec/backlog-parser';
import { validateBacklog } from '../src/core/openspec/backlog-validator';
import { planTaskCardsForItem, getPhaseOrder, selectNextItem } from '../src/core/openspec/backlog-planner';
import { canTransition } from '../src/core/openspec/openspec-state';

const FIXTURE = resolve(import.meta.dir, 'fixtures/backlog/BACKLOG.md');

describe('backlog-parser', () => {
  test('parses fixture BACKLOG.md', async () => {
    const content = await readFile(FIXTURE, 'utf-8');
    const result = parseBacklogMarkdown(content);
    expect(result.success).toBe(true);
    if (!result.success) return;

    const doc = result.data;
    expect(doc.global.product).toBe('CodeConductor');
    expect(doc.global.tddRequired).toBe(true);
    expect(doc.items.length).toBe(2);
    expect(doc.archive.length).toBe(1);
    expect(doc.items[0].id).toBe('BC-001');
    expect(doc.items[0].acceptanceCriteria.length).toBe(2);
    expect(doc.items[1].dependencies).toEqual(['BC-001']);
  });

  test('loadBacklog reads from project root', async () => {
    const root = resolve(import.meta.dir, 'fixtures/backlog');
    const result = await loadBacklog(root);
    expect(result.success).toBe(true);
  });

  test('rejects missing Global section', () => {
    const bad = `# BACKLOG\n\n## Items\n\n### BC-001 | Test\n- Priority: P1\n- Status: READY\n- Type: feature\n- Depends on: none\n- Description: x\n- Scope: y\n- Acceptance:\n  - [ ] criterion one long enough\n`;
    const result = parseBacklogMarkdown(bad);
    expect(result.success).toBe(false);
  });
});

describe('backlog-validator', () => {
  test('valid fixture passes validation', async () => {
    const content = await readFile(FIXTURE, 'utf-8');
    const parsed = parseBacklogMarkdown(content);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const report = validateBacklog(parsed.data);
    expect(report.valid).toBe(true);
    expect(report.errors).toHaveLength(0);
  });

  test('rejects vague acceptance criteria', async () => {
    const content = await readFile(FIXTURE, 'utf-8');
    const parsed = parseBacklogMarkdown(content);
    if (!parsed.success) return;
    const doc = parsed.data;
    doc.items[0].acceptanceCriteria = ['improve UX'];
    const report = validateBacklog(doc);
    expect(report.valid).toBe(false);
    expect(report.errors.some((e) => e.code === 'VAGUE_ACCEPTANCE')).toBe(true);
    expect(report.recommendations.length).toBeGreaterThan(0);
  });

  test('rejects unknown dependency', async () => {
    const content = await readFile(FIXTURE, 'utf-8');
    const parsed = parseBacklogMarkdown(content);
    if (!parsed.success) return;
    const doc = parsed.data;
    doc.items[0].dependencies = ['BC-999'];
    const report = validateBacklog(doc);
    expect(report.valid).toBe(false);
    expect(report.errors.some((e) => e.code === 'UNKNOWN_DEPENDENCY')).toBe(true);
  });
});

describe('backlog-planner', () => {
  test('TDD order places test before implement', async () => {
    const content = await readFile(FIXTURE, 'utf-8');
    const parsed = parseBacklogMarkdown(content);
    if (!parsed.success) return;
    const phases = getPhaseOrder(parsed.data);
    const testIdx = phases.indexOf('test');
    const implIdx = phases.indexOf('implement');
    expect(testIdx).toBeLessThan(implIdx);
  });

  test('planTaskCardsForItem creates chained cards', async () => {
    const content = await readFile(FIXTURE, 'utf-8');
    const parsed = parseBacklogMarkdown(content);
    if (!parsed.success) return;
    const item = parsed.data.items[0];
    const cards = planTaskCardsForItem(item, parsed.data);
    expect(cards.length).toBe(5);
    expect(cards[0].dependsOn).toEqual([]);
    expect(cards[1].dependsOn).toEqual([cards[0].id]);
  });

  test('selectNextItem picks READY item with satisfied deps', async () => {
    const content = await readFile(FIXTURE, 'utf-8');
    const parsed = parseBacklogMarkdown(content);
    if (!parsed.success) return;
    const next = selectNextItem(parsed.data);
    expect(next?.id).toBe('BC-001');
  });
});

describe('openspec-state transitions', () => {
  test('allowed transitions', () => {
    expect(canTransition('READY', 'PLANNED')).toBe(true);
    expect(canTransition('REVIEW', 'IN_PROGRESS')).toBe(true);
    expect(canTransition('TODO', 'DONE')).toBe(false);
  });
});
