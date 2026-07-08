/**
 * Regression tests for Phase 3 documentation requirements.
 *
 * Verifies that:
 *   - `docs/task-card-template.md` documents `depends_on` as an optional field
 *     (AC5)
 *   - `AGENTS.md` explains dependency-order delegation for the orchestrator
 *     (AC6)
 *   - `AGENTS.md` defines the `goal-planner` agent (AC6)
 *
 * These are content checks, not behavioral tests. They prevent the docs from
 * drifting away from the implementation contract.
 */
import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dir, '..');
const TASK_CARD_TEMPLATE = join(PROJECT_ROOT, 'docs', 'task-card-template.md');
const AGENTS_MD = join(PROJECT_ROOT, 'AGENTS.md');

describe('Phase 3 documentation: task-card-template.md', () => {
  test('documents depends_on as an optional field (AC5)', async () => {
    const content = await readFile(TASK_CARD_TEMPLATE, 'utf-8');

    // The template must mention depends_on
    expect(content).toMatch(/\*\*depends_on\*\*/);

    // It must explicitly call out the field as optional somewhere in
    // the depends_on field-reference paragraph. The paragraph begins with
    // "**depends_on** —" and ends at the next blank line.
    const dependsOnParagraph = content.match(
      /\*\*depends_on\*\*[\s\S]*?(?=\n\n)/,
    );
    expect(dependsOnParagraph).not.toBeNull();
    if (dependsOnParagraph) {
      // Must include "Optional" in some form ("Optional" or "optionally"
      // or "If omitted")
      expect(dependsOnParagraph[0]).toMatch(/[Oo]ptional|[Oo]mited/);
    }

    // It must explain that it controls delegation order
    expect(content).toMatch(/depends_on/);
    expect(content).toMatch(/[Dd]ependency/);
  });

  test('task card template includes depends_on in the field-reference section', async () => {
    const content = await readFile(TASK_CARD_TEMPLATE, 'utf-8');

    // The field reference section must include depends_on
    const fieldRefIndex = content.indexOf('## Field Reference');
    expect(fieldRefIndex).toBeGreaterThan(-1);
    const afterFieldRef = content.slice(fieldRefIndex);
    expect(afterFieldRef).toMatch(/\*\*depends_on\*\*/);
  });
});

describe('Phase 3 documentation: AGENTS.md', () => {
  test('defines the goal-planner agent (AC6)', async () => {
    const content = await readFile(AGENTS_MD, 'utf-8');

    // A `### goal-planner` heading must exist
    expect(content).toMatch(/^###\s+goal-planner/m);

    // It must include a Role description
    const goalPlannerSection = content.match(/###\s+goal-planner[\s\S]*?(?=\n###\s|\n##\s|\Z)/);
    expect(goalPlannerSection).not.toBeNull();
    if (goalPlannerSection) {
      expect(goalPlannerSection[0]).toMatch(/\*\*Role:\*\*/);
      expect(goalPlannerSection[0]).toMatch(/Deterministic template matching/);
    }
  });

  test('explains dependency-order delegation for the orchestrator (AC6)', async () => {
    const content = await readFile(AGENTS_MD, 'utf-8');

    // The phrase "Dependency order delegation" must appear
    expect(content).toMatch(/[Dd]ependency order delegation/);

    // It must be attributed to the orchestrator
    const delegationSection = content.match(
      /\*\*Dependency order delegation[^*]*\*\*[\s\S]*?(?=\n###\s|\n##\s|\n\*\*[A-Z][a-z]+|\Z)/,
    );
    expect(delegationSection).not.toBeNull();
    if (delegationSection) {
      // Should mention orchestrator
      expect(delegationSection[0].toLowerCase()).toContain('orchestrator');
      // Should mention depends_on
      expect(delegationSection[0]).toMatch(/depends_on/);
      // Should mention status
      expect(delegationSection[0]).toMatch(/status/);
    }
  });

  test('references .codeconductor/current-goal.yml as the orchestrator state file', async () => {
    const content = await readFile(AGENTS_MD, 'utf-8');

    // The current-goal.yml path should be mentioned in the delegation context
    expect(content).toMatch(/current-goal\.yml/);
    // And it should be near the dependency-order delegation explanation
    const goalYmlIndex = content.indexOf('current-goal.yml');
    const delegationIndex = content.indexOf('Dependency order delegation');
    expect(Math.abs(goalYmlIndex - delegationIndex)).toBeLessThan(2000);
  });
});
