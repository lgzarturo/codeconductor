/**
 * D2 council-unificado — RED tests (TDD Step 3).
 *
 * D2 end-state: 1 canonical roster (src/presets/council/council.yml),
 * 1 role content (ROLE_PROFILES), 1 canonical CCEP workflow YAML
 * (src/core/ccep/workflows/council.yml); profiles.ts becomes a generated
 * mirror; the skill stub is a pure redirect; the 6 target copies of
 * Steps 0-5 become generated/redirect; CCEP compat (skill council,
 * gates, compile exit 0) is preserved.
 *
 * Tests marked RED fail on the pre-D2 tree for the stated reason and
 * must pass after D2. Tests marked GUARD already pass and pin behavior
 * D2 must not break.
 */
import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { ccepCommand } from '../../src/commands/ccep.command';
import { parseCommand } from '../../src/core/ccep/command-parser';
import { resolveContext } from '../../src/core/ccep/context-resolver';
import { compilePrompt } from '../../src/core/ccep/prompt-compiler';
import { loadWorkflowProfile } from '../../src/core/ccep/workflow-profile-loader';
import { DEFAULT_COUNCIL_AGENTS } from '../../src/domain/council/council-spec';
import type { PlannerOutputInput } from '../../src/validation/schemas';
import { invokeCli } from '../helpers/invoke-cli';

const ROOT = resolve(import.meta.dir, '../..');

const COUNCIL_PHASE_IDS = ['wayfinding', 'deliberation', 'tdd', 'implement', 'council-review'];

const SIX_TARGETS = [
  'presets/codex/skills/cc-council/SKILL.md',
  'presets/agy/workflows/cc-council.md',
  'presets/claude/commands/cc/council.md',
  'presets/cursor/commands/cc/council.md',
  'presets/opencode/commands/cc-council.md',
  'presets/gemini/commands/cc/council.toml',
] as const;

/** Full manual Step-0 body marker: present in every pre-D2 copy. */
const STEP0_BODY_MARKER = 'ccep compile --command council --phase';

function planner(overrides: Partial<PlannerOutputInput> = {}): PlannerOutputInput {
  return {
    status: 'success',
    confidence: 0.9,
    goal: 'Ship safely',
    assumptions: [],
    risks: [],
    tasks: [],
    questionsForUser: [],
    needsConfirmation: false,
    ...overrides,
  };
}

describe('D2 council-unificado', () => {
  test('A1 GUARD: canonical workflow YAML carries the 5 council phases', async () => {
    const raw = await readFile(join(ROOT, 'src/core/ccep/workflows/council.yml'), 'utf-8');
    const ids = (parseYaml(raw) as { phases: Array<{ id: string }> }).phases.map((p) => p.id);
    expect(ids).toEqual(COUNCIL_PHASE_IDS);
  });

  test('A1 GUARD: ccep compile exits 0 for all 5 council phases via CLI', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'd2-council-compile-'));
    try {
      await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'd2-fixture' }));
      const profile = loadWorkflowProfile('council');
      expect(profile.phases.map((p) => p.id)).toEqual(COUNCIL_PHASE_IDS);
      for (const phase of profile.phases) {
        const role =
          phase.agent ?? (phase.agents !== undefined && phase.agents.length > 0 ? phase.agents[0] : 'orchestrator');
        const result = await invokeCli(
          [
            'ccep',
            'compile',
            '--command',
            'council',
            '--phase',
            phase.id,
            '--role',
            role,
            'Add OAuth2 login',
            '--output=json',
          ],
          dir,
        );
        expect(result.exitCode).toBe(0);
        expect(JSON.parse(result.stdout).success).toBe(true);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('A1 RED: profiles.ts council entry is a generated mirror, not hardcoded phases', async () => {
    const src = await readFile(join(ROOT, 'src/core/ccep/profiles.ts'), 'utf-8');
    // Post-D2 the council entry is derived from the canonical YAML (mirror/shim):
    // no hardcoded `council: { ... phases ... }` block may remain.
    expect(src).not.toMatch(/council:\s*\{/);
  });

  test('A2 GUARD: council gate stops on questionsForUser (real fixture)', async () => {
    const result = await ccepCommand({
      subcommand: 'evaluate',
      projectRoot: ROOT,
      output: 'json',
      command: 'council',
      userRequest: 'Add OAuth2 login',
      input: JSON.stringify(planner({ questionsForUser: ['Global or per-plan?'] })),
    });
    expect(result.code).toBe(1);
    const data = result.data as { stop: boolean; decision: { reason?: string } };
    expect(data.stop).toBe(true);
    expect(data.decision.reason).toBe('clarification');
  });

  test('A2 GUARD: council gate stops on high-risk (real fixture)', async () => {
    const result = await ccepCommand({
      subcommand: 'evaluate',
      projectRoot: ROOT,
      output: 'json',
      command: 'council',
      userRequest: 'Add OAuth2 login',
      input: JSON.stringify(
        planner({ risks: [{ type: 'security', description: 'Auth touched', severity: 'high' }] }),
      ),
    });
    expect(result.code).toBe(1);
    const data = result.data as { stop: boolean; decision: { reason?: string } };
    expect(data.stop).toBe(true);
    expect(data.decision.reason).toBe('high_risk');
  });

  test('A4 GUARD: canonical roster is 6 agents from council.yml', async () => {
    const raw = await readFile(join(ROOT, 'src/presets/council/council.yml'), 'utf-8');
    const roster = parseYaml(raw) as { agents: Array<{ id: string }> };
    expect(roster.agents.map((a) => a.id).sort()).toEqual(
      ['architect', 'data-ops', 'delivery', 'devil', 'product', 'security-reviewer'].sort(),
    );
  });

  test('A4 GUARD: code default roster matches the canonical 6 (no 6-vs-7 divergence)', async () => {
    const raw = await readFile(join(ROOT, 'src/presets/council/council.yml'), 'utf-8');
    const roster = parseYaml(raw) as { agents: Array<{ id: string }> };
    expect(DEFAULT_COUNCIL_AGENTS.map((a) => a.id).sort()).toEqual(
      roster.agents.map((a) => a.id).sort(),
    );
  });

  test.each([...SIX_TARGETS])('A5 RED: %s is generated (marker) or redirect (shim)', async (rel) => {
    const content = await readFile(join(ROOT, rel), 'utf-8');
    const hasGeneratedMarker =
      content.toLowerCase().includes('generated') &&
      (content.includes('DO NOT EDIT') ||
        content.toLowerCase().includes('do not edit') ||
        content.toLowerCase().includes('source of truth') ||
        content.toLowerCase().includes('generator'));
    const isRedirectShim =
      !content.includes(STEP0_BODY_MARKER) &&
      (content.includes('council.yml') ||
        content.includes('.agents/skills/council') ||
        content.includes('ROLE_PROFILES'));
    expect(
      hasGeneratedMarker || isRedirectShim,
      `${rel}: expected a generated marker or a redirect shim, found a full manual Steps copy`,
    ).toBe(true);
  });

  test('A6 GUARD: skill stub stays short (<=30 lines)', async () => {
    const content = await readFile(join(ROOT, '.agents/skills/council/SKILL.md'), 'utf-8');
    expect(content.split('\n').length).toBeLessThanOrEqual(30);
  });

  test('A6 RED: skill stub is a pure redirect (pointer only, no embedded roster)', async () => {
    const content = await readFile(join(ROOT, '.agents/skills/council/SKILL.md'), 'utf-8');
    expect(content).toMatch(/council\.yml|ROLE_PROFILES|generated/i);
    expect(content).not.toContain('## Agents');
    expect(content).not.toContain('- Architect (architect)');
  });

  test('A7 RED: docs/council-steering.md has no stale 6-vs-7 divergence note', async () => {
    const content = await readFile(join(ROOT, 'docs/council-steering.md'), 'utf-8');
    expect(content).not.toContain('Divergence to reconcile');
  });

  test('Q6 RED: total runtime prompt chars across 5 phases is below baseline 22479', async () => {
    // Recipe: fixed 524-char request, repo-root context, promptVersion v1.0.0,
    // role = phase.agent ?? phase.agents[0]. Pre-D2 per-phase baselines:
    const BASELINE_PER_PHASE: Record<string, number> = {
      wayfinding: 2570,
      deliberation: 2733,
      tdd: 1748,
      implement: 7210,
      'council-review': 8218,
    };
    const BASELINE_TOTAL = 22479;
    expect(Object.values(BASELINE_PER_PHASE).reduce((n, v) => n + v, 0)).toBe(BASELINE_TOTAL);

    const base = 'Add OAuth2 login';
    const pad = ' Search and replace this padding text until the request is long enough for calibration purposes.';
    let request = base;
    while (request.length < 524) request += pad;
    request = request.slice(0, 524);
    expect(request).toHaveLength(524);

    const profile = loadWorkflowProfile('council');
    const envelope = parseCommand('council', request, ROOT);
    const context = await resolveContext(envelope, profile, ROOT);
    let total = 0;
    for (const phase of profile.phases) {
      const role =
        phase.agent ?? (phase.agents !== undefined && phase.agents.length > 0 ? phase.agents[0] : 'orchestrator');
      const compiled = compilePrompt({ role, phase: phase.id, context, promptVersion: 'v1.0.0' });
      expect(Object.keys(BASELINE_PER_PHASE)).toContain(phase.id);
      total += compiled.prompt.length;
    }
    expect(total).toBeLessThan(BASELINE_TOTAL);
  });
});
