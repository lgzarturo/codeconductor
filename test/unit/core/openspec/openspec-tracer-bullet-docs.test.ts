/**
 * Tests for BC-006 — Tracer-bullet documentation in openspec.md
 *
 * These tests verify that presets/claude/commands/cc/openspec.md (the
 * versioned, canonical source — .claude/commands/cc is a gitignored local
 * install copy and isn't guaranteed to exist in CI) documents:
 * 1. Tracer-bullet as a vertical slice that fits within a context window
 * 2. A quantitative heuristic for sizing (e.g., max acceptance criteria or phases per window)
 * 3. "Depends on" field as blocking edges between BC-NNN items
 * 4. Equivalence: BC-NNN = tracer-bullet = one or more TaskCards from `cc openspec plan`
 *
 * The docstring for each test indicates which acceptance criterion it covers.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_ROOT = process.cwd();
const OPENSPEC_DOC_PATH = resolve(PROJECT_ROOT, 'presets', 'claude', 'commands', 'cc', 'openspec.md');

function readOpenspecDoc(): string {
  return readFileSync(OPENSPEC_DOC_PATH, 'utf-8');
}

describe('openspec.md documentation — tracer-bullet mechanics', () => {
  test('should define tracer bullet as a vertical slice demoable within a context window', () => {
    // Acceptance Criterion 1: La guía define tracer bullet como rebanada vertical demoable del tamaño de un contexto
    const doc = readOpenspecDoc();
    
    // Look for explicit definition of "tracer bullet" or "tracer-bullet"
    const hasTracerBulletDefinition = /tracer.?bullet/i.test(doc);
    expect(hasTracerBulletDefinition).toBe(true, 'openspec.md must define tracer bullet');
    
    // Should mention it is a vertical slice ("rebanada vertical" or equivalent in English)
    const isVerticalSlice = 
      /vertical.{0,30}slice|rebanada.{0,30}vertical|slice.{0,30}demoable|vertical.{0,30}demoable/i.test(doc);
    expect(isVerticalSlice).toBe(true, 'tracer bullet must be described as a vertical slice');
    
    // Should mention context or context window as a size constraint
    const hasContextWindowMention = /context.{0,50}window|context.{0,50}budget|context.{0,50}size/i.test(doc);
    expect(hasContextWindowMention).toBe(true, 'tracer bullet definition must reference context window or budget');
  });

  test('should include a quantitative heuristic for tracer-bullet sizing', () => {
    // Acceptance Criterion 1: La guía define...con una heurística cuantitativa explícita (p. ej. máximo de criterios de aceptación o fases por ventana de contexto)
    const doc = readOpenspecDoc();
    
    // Must explicitly state a quantitative measure, not just "fits in context"
    // Examples of quantitative heuristics:
    // - "maximum N acceptance criteria"
    // - "maximum N phases"
    // - "maximum N TaskCards"
    // - "maximum tokens" or "context budget" with a number
    const hasQuantitativeMeasure = 
      /maximum.{0,20}(\d+|[a-z]+).{0,20}(criteria|phases|task.?card|acceptance)/i.test(doc) ||
      /(\d+).{0,20}(criteria|phases|task.?card|acceptance).{0,20}maximum/i.test(doc) ||
      /context.{0,20}budget.{0,50}\d+|context.{0,20}window.{0,50}\d+|\d+.{0,20}(token|criteri|phase|task)/i.test(doc);
    
    expect(hasQuantitativeMeasure).toBe(true, 
      'openspec.md must state an explicit quantitative heuristic (e.g., "max N criteria per tracer-bullet"), not just reference CLAUDE.md Context Budget');
  });

  test('should document "Depends on" as the mechanism for expressing blocking edges between BC-NNN items', () => {
    // Acceptance Criterion 2: Las aristas bloqueantes se expresan como "Depends on" entre items BC-NNN
    const doc = readOpenspecDoc();
    
    // Must mention "Depends on" field explicitly
    const hasDependsOnField = /Depends\s+on/i.test(doc);
    expect(hasDependsOnField).toBe(true, 'openspec.md must mention "Depends on" field');
    
    // Should reference blocking or dependencies or prerequisite
    const hasBlockingLanguage = /blocking|block|prerequisite|dependency|depend|blocking.{0,30}edge/i.test(doc);
    expect(hasBlockingLanguage).toBe(true, 'openspec.md should explain "Depends on" as a blocking mechanism');
    
    // Should reference BC-NNN format
    const hasBacklogIdFormat = /BC-\d+/i.test(doc);
    expect(hasBacklogIdFormat).toBe(true, 'openspec.md should reference BC-NNN item format in context of dependencies');
  });

  test('should document the equivalence: BC-NNN = tracer-bullet = one or more TaskCards from cc openspec plan', () => {
    // Acceptance Criterion 2: documenta explícitamente la equivalencia "un BC-NNN = un tracer-bullet = una o más TaskCards" generadas por `cc openspec plan`
    const doc = readOpenspecDoc();
    
    // Must reference BC-NNN items in context of tracer-bullets or vice versa
    const hasBCTracerRelation = 
      /(BC-\d+|backlog.{0,30}item).{0,100}tracer.?bullet|tracer.?bullet.{0,100}(BC-\d+|backlog.{0,30}item)/i.test(doc);
    expect(hasBCTracerRelation).toBe(true, 'openspec.md must document relationship between BC-NNN items and tracer-bullets');
    
    // Must mention or reference "cc openspec plan" or "plan" generating TaskCards
    const hasPlanCommand = /cc\s+openspec\s+plan|openspec.{0,50}plan/i.test(doc);
    expect(hasPlanCommand).toBe(true, 'openspec.md must reference "cc openspec plan" command');
    
    // Should mention TaskCards
    const hasTaskCard = /task.?card/i.test(doc);
    expect(hasTaskCard).toBe(true, 'openspec.md should mention TaskCards in context of planning');
  });

  test('should explicitly state the relationship between BC-NNN, tracer-bullet, and TaskCards', () => {
    // Acceptance Criterion 2 (detailed): explicit equivalence statement
    const doc = readOpenspecDoc();
    
    // Look for explicit linking phrases indicating BC-NNN corresponds to tracer-bullet(s)
    // Using RegExp constructor to avoid line-break issues
    const patterns = [
      new RegExp('(BC-\\d+|item|backlog).{0,30}(correspond|map|equal|equivalent|represent|equate).{0,30}tracer.?bullet', 'i'),
      new RegExp('tracer.?bullet.{0,30}(correspond|map|equal|equivalent|represent|equate).{0,30}(BC-\\d+|item|backlog)', 'i'),
      new RegExp('one.+BC-.+tracer.?bullet', 'i'),
      new RegExp('tracer.?bullet.+one.+BC-', 'i'),
    ];
    
    const hasEquivalenceStatement = patterns.some(p => p.test(doc));
    
    expect(hasEquivalenceStatement).toBe(true, 
      'openspec.md must contain an explicit statement of the equivalence (e.g., "one BC-NNN = one tracer-bullet")');
  });
});
