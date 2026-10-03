/**
 * D3 token-audit — RED tests (TDD Step 3).
 *
 * D3 end-state: new `.agents/skills/token-audit/SKILL.md` skill (rules C1
 * duplication-council, C2 fallback-sync, S1 STOP/scope report-only;
 * canonical sibling frontmatter; official bytes/4 + bytes/% method);
 * canonical `presets/agy/workflows/cc-council.md` with the 5 other council
 * copies as minimal-header redirect stubs (<400B each) produced ONLY via
 * inject+render regeneration (never manual); COUNCIL_FALLBACK_PROFILE
 * generated from council.yml and covered by check:drift; gate
 * check:council-redirect wired in package.json + CI; measured savings
 * report in bytes/% vs the ~19KB baseline.
 *
 * Tests marked RED fail on the pre-D3 tree for the stated reason and must
 * pass after D3. Tests marked GUARD already pass and pin behavior D3 must
 * not break.
 */
import { describe, expect, test } from 'bun:test';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { validateWorkflowProfile } from '../../src/validation/schemas';

const ROOT = resolve(import.meta.dir, '../..');

const CANONICAL = 'presets/agy/workflows/cc-council.md';

/** The 5 council copies that become redirect stubs (canonical = agy). */
const FIVE_TARGETS = [
  'presets/codex/skills/cc-council/SKILL.md',
  'presets/claude/commands/cc/council.md',
  'presets/cursor/commands/cc/council.md',
  'presets/opencode/commands/cc-council.md',
  'presets/gemini/commands/cc/council.toml',
] as const;

/** Full manual Step-0 body marker: present in every pre-D3 copy. */
const STEP0_BODY_MARKER = 'ccep compile --command council --phase';

const STUB_MAX_BYTES = 400;

/**
 * Pre-D3 measured total of the 5 copies (4151+3793+3793+3793+3797).
 * Q5/AC7: report measured savings in bytes/% vs this ~19KB baseline.
 */
const BASELINE_BYTES = 19327;

const SKILL_PATH = join(ROOT, '.agents/skills/token-audit/SKILL.md');
const GATE_SCRIPT = 'scripts/check-council-redirect.ts';
const FALLBACK_GENERATED = 'src/core/ccep/council-fallback.generated.ts';

async function runBun(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(['bun', ...args], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}

async function readRel(rel: string): Promise<string> {
  return readFile(join(ROOT, rel), 'utf-8');
}

describe('D3 token-audit', () => {
  test('A0 GUARD: canonical agy council copy keeps the full Steps body', async () => {
    const content = await readRel(CANONICAL);
    expect(content).toContain(STEP0_BODY_MARKER);
  });

  test('A0 GUARD: ~19KB baseline constant matches the documented pre-D3 total', async () => {
    expect(BASELINE_BYTES).toBeGreaterThan(18 * 1024);
    expect(BASELINE_BYTES).toBeLessThan(20 * 1024);
  });

  test('AC1 RED: token-audit skill file exists', async () => {
    const content = await readFile(SKILL_PATH, 'utf-8');
    expect(content.length).toBeGreaterThan(0);
  });

  test('AC1 RED: skill carries canonical sibling frontmatter (Q7)', async () => {
    const content = await readFile(SKILL_PATH, 'utf-8');
    expect(content.startsWith('---\n')).toBe(true);
    const normalized = content.replace(/\r/g, '');
    expect(normalized).toContain('\nname: token-audit\n');
    expect(normalized).toMatch(/\ndescription: .+\n/);
    expect(normalized.indexOf('\n---\n')).toBeGreaterThan(0);
  });

  test('AC1 RED: skill declares rules C1 (duplication), C2 (fallback), S1 (STOP/scope)', async () => {
    const content = await readFile(SKILL_PATH, 'utf-8');
    expect(content).toMatch(/\bC1\b/);
    expect(content).toMatch(/\bC2\b/);
    expect(content).toMatch(/\bS1\b/);
    expect(content.toLowerCase()).toContain('council');
    expect(content.toLowerCase()).toContain('fallback');
    expect(content).toContain('STOP');
  });

  test('AC1 RED: skill declares the official bytes/4 + bytes/% method (Q5, no cutoff)', async () => {
    const content = await readFile(SKILL_PATH, 'utf-8');
    expect(content).toContain('bytes/4');
    expect(content).toMatch(/bytes\/%|%.*bytes|bytes.*%/i);
  });

  test.each([...FIVE_TARGETS])('AC2 RED: %s is a minimal-header stub <400B', async (rel) => {
    const content = await readRel(rel);
    const bytes = Buffer.byteLength(content, 'utf8');
    expect(bytes, `${rel}: ${bytes}B >= ${STUB_MAX_BYTES}B`).toBeLessThan(STUB_MAX_BYTES);
    expect(content, `${rel}: still carries the full Steps body`).not.toContain(STEP0_BODY_MARKER);
  });

  test.each([...FIVE_TARGETS])(
    'AC2 GUARD: %s keeps the GENERATED banner and points at the canonical copy',
    async (rel) => {
      const content = await readRel(rel);
      expect(content).toMatch(/generated/i);
      expect(content).toMatch(/DO NOT EDIT/i);
      expect(content).toContain(CANONICAL);
    },
  );

  test('AC3 RED: inject supports redirect mode (stub generation, never manual)', async () => {
    const src = await readRel('scripts/inject-ccep-bootstrap.ts');
    expect(src).toMatch(/redirect/i);
  });

  test('AC3 RED: render supports redirect format for gemini/codex', async () => {
    const src = await readRel('scripts/render-agent-commands.ts');
    expect(src).toMatch(/redirect/i);
  });

  test('AC3 RED: inject+render regeneration is idempotent and yields stubs', async () => {
    const snapshots = new Map<string, string>();
    for (const rel of FIVE_TARGETS) snapshots.set(rel, await readRel(rel));
    try {
      await runBun(['run', 'scripts/inject-ccep-bootstrap.ts']);
      await runBun(['run', 'scripts/render-agent-commands.ts']);
      const pass1 = new Map<string, string>();
      for (const rel of FIVE_TARGETS) pass1.set(rel, await readRel(rel));
      await runBun(['run', 'scripts/inject-ccep-bootstrap.ts']);
      await runBun(['run', 'scripts/render-agent-commands.ts']);
      for (const rel of FIVE_TARGETS) {
        const pass2 = await readRel(rel);
        expect(pass2, `${rel}: second regeneration pass changed bytes`).toBe(pass1.get(rel));
        const bytes = Buffer.byteLength(pass2, 'utf8');
        expect(bytes, `${rel}: regenerated copy is ${bytes}B, not a stub`).toBeLessThan(STUB_MAX_BYTES);
      }
    } finally {
      for (const [rel, content] of snapshots) await writeFile(join(ROOT, rel), content);
    }
  });

  test('AC4 RED: check:council-redirect fails when a full body is restored', async () => {
    const victim = 'presets/claude/commands/cc/council.md';
    const original = await readRel(victim);
    const fullBody = await readRel(CANONICAL);
    expect(fullBody).toContain(STEP0_BODY_MARKER);
    try {
      await writeFile(join(ROOT, victim), fullBody);
      const result = await runBun(['run', 'check:council-redirect']);
      expect(result.exitCode, `gate must fail on a restored full body: ${result.stdout}`).not.toBe(0);
      const output = `${result.stdout}\n${result.stderr}`;
      // The gate must name the offending copy: a bare "Script not found"
      // error (pre-D3, script unwired) does not satisfy this.
      expect(output, `gate must name the offending copy (got: ${output.slice(0, 200)})`).toContain(victim);
    } finally {
      await writeFile(join(ROOT, victim), original);
    }
  });

  test('AC5 RED: profiles.ts no longer hardcodes the fallback literal (Q3: generated)', async () => {
    const src = await readRel('src/core/ccep/profiles.ts');
    expect(src).not.toMatch(/const COUNCIL_FALLBACK_PROFILE[^=]*=\s*\{/);
    expect(src).toMatch(/generated/i);
  });

  test('AC5 RED: fallback artifact is generated from council.yml and matches it', async () => {
    const generated = await readRel(FALLBACK_GENERATED);
    expect(generated).toMatch(/generated/i);
    expect(generated).toMatch(/DO NOT EDIT/i);
    const raw = await readRel('src/core/ccep/workflows/council.yml');
    const expected = validateWorkflowProfile(parseYaml(raw));
    const mod = (await import(`../../${FALLBACK_GENERATED.replace(/\.ts$/, '')}`)) as Record<string, unknown>;
    const fallback = (mod.CouncilFallbackProfile ?? mod.COUNCIL_FALLBACK_PROFILE ?? mod.default) as unknown;
    expect(fallback).toEqual(expected);
  });

  test('AC5 RED: check:drift covers the generated fallback', async () => {
    const src = await readRel('scripts/check-drift.ts');
    expect(src).toContain('council-fallback.generated');
  });

  test('AC6 RED: check:council-redirect is wired in package.json', async () => {
    const pkg = JSON.parse(await readRel('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts['check:council-redirect']).toBeDefined();
    expect(pkg.scripts['check:council-redirect']).toContain(GATE_SCRIPT);
  });

  test('AC6 RED: gate script exists and CI runs it', async () => {
    const src = await readRel(GATE_SCRIPT);
    expect(src.length).toBeGreaterThan(0);
    const ci = await readRel('.github/workflows/ci.yml');
    expect(ci).toContain('check:council-redirect');
  });

  test('AC6 RED: gate allows progress on a clean tree (Q6)', async () => {
    const result = await runBun(['run', 'check:council-redirect']);
    expect(result.exitCode, `clean-tree gate run failed: ${result.stderr}`).toBe(0);
  });

  test('AC7 RED: measured total of the 5 copies is below the ~19KB baseline', async () => {
    let total = 0;
    for (const rel of FIVE_TARGETS) total += Buffer.byteLength(await readRel(rel), 'utf8');
    const saved = BASELINE_BYTES - total;
    const pct = (saved / BASELINE_BYTES) * 100;
    expect(total, `no measured reduction: total ${total}B vs baseline ${BASELINE_BYTES}B`).toBeLessThan(
      BASELINE_BYTES,
    );
    expect(pct, 'savings % is not positive').toBeGreaterThan(0);
  });

  test('S1 RED: skill documents STOP/scope as report-only (count, never blocking)', async () => {
    const content = await readFile(SKILL_PATH, 'utf-8');
    expect(content).toMatch(/STOP\/scope|STOP.*scope|scope.*STOP/i);
    expect(content).toMatch(/report-only|report only|non-blocking|sin bloqueo|no bloquea/i);
    expect(content).toMatch(/\d+/);
  });

  test('S1 RED: council-redirect gate never blocks on STOP/scope (report only)', async () => {
    const src = await readRel(GATE_SCRIPT);
    expect(src).not.toMatch(/STOP.*exit\s*\(\s*1\s*\)|exit\s*\(\s*1\s*\).*STOP/s);
  });
});
