import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parseCommand } from '../../../../src/core/ccep/command-parser';
import { resolveContext } from '../../../../src/core/ccep/context-resolver';
import { compilePrompt } from '../../../../src/core/ccep/prompt-compiler';
import { resolveScopedContext, stableStringify } from '../../../../src/core/ccep/scoped-rules';
import { loadWorkflowProfile } from '../../../../src/core/ccep/workflow-profile-loader';
import { ScopedContextSchema } from '../../../../src/validation/scoped-context-schemas';
import { invokeCli } from '../../../helpers/invoke-cli';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cc-scoped-'));
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'fixture', type: 'module' }));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
const put = async (rel: string, content: string) => {
  await mkdir(dirname(join(root, rel)), { recursive: true });
  await writeFile(join(root, rel), content);
};
const ruleYaml = (id: string, action: string, extra = '') => `schemaVersion: 1
rules:
  - id: ${id}
    kind: default
    scopeRoot: .
    trigger: when touched
    action: ${action}
    reason: why
    exceptions: none without Task Card
    verification: { recipeIds: [check] }
${extra}`;

describe('resolveScopedContext (orquestador)', () => {
  test('sin reglas en el proyecto la función no aporta contexto ni diagnósticos', async () => {
    expect(await resolveScopedContext(root, { files: ['src/a.ts'], role: 'implementer' })).toEqual({
      blocked: false,
      diagnostics: [],
    });
  });

  test('con reglas devuelve manifiesto válido y una vista con hash propio', async () => {
    await put('.codeconductor/rules/a.yml', ruleYaml('app.errors.boundary', 'keep public error type'));
    const out = await resolveScopedContext(root, { files: ['src/a.ts'], role: 'implementer' });
    expect(out.blocked).toBe(false);
    const ctx = ScopedContextSchema.parse(out.scopedContext);
    expect(ctx.view.rules).toMatchObject([
      { id: 'app.errors.boundary', action: 'keep public error type', verify: ['check'], appliesTo: ['src/a.ts'] },
    ]);
    expect(ctx.view.hash).toBe(createHash('sha256').update(stableStringify(ctx.view.rules)).digest('hex'));
    expect(ctx.view.hash).not.toBe(ctx.manifest.hash);
    const bytes = ctx.view.rules.reduce((sum, r) => sum + Buffer.byteLength(stableStringify(r), 'utf-8'), 0);
    expect(ctx.manifest.budget).toEqual({ maxBytes: 16384, usedBytes: bytes });
  });

  test('un conflicto de reglas queda en el manifiesto y bloquea', async () => {
    await put('.codeconductor/rules/a.yml', ruleYaml('app.x.y', 'A'));
    await put('.codeconductor/rules/b.yml', ruleYaml('app.x.y', 'B'));
    const out = await resolveScopedContext(root, { files: ['src/a.ts'], role: 'implementer' });
    expect(out.blocked).toBe(true);
    expect(out.scopedContext?.manifest.diagnostics.map((d) => d.code)).toContain('rule_conflict');
  });

  test('un archivo de reglas inválido bloquea aunque no quede ninguna regla válida', async () => {
    await put('.codeconductor/rules/bad.yml', 'rules: [unclosed');
    const out = await resolveScopedContext(root, { files: ['src/a.ts'], role: 'implementer' });
    expect(out.blocked).toBe(true);
    expect(out.diagnostics.map((d) => d.code)).toEqual(['rule_source_invalid']);
  });

  test('un presupuesto menor que las reglas obligatorias bloquea con context_budget_exceeded', async () => {
    await put('.codeconductor/rules/a.yml', ruleYaml('app.errors.boundary', 'keep public error type'));
    const out = await resolveScopedContext(root, { files: ['src/a.ts'], role: 'implementer', maxBytes: 10 });
    expect(out.blocked).toBe(true);
    expect(out.diagnostics.map((d) => d.code)).toContain('context_budget_exceeded');
    expect(out.diagnostics.find((d) => d.code === 'context_budget_exceeded')?.message).toContain('app.errors.boundary');
  });
});

describe('compilePrompt con scopedContext', () => {
  const compile = async (files?: string[]) => {
    await put('.codeconductor/rules/a.yml', ruleYaml('app.errors.boundary', 'keep public error type'));
    const envelope = parseCommand('feature', 'add endpoint', root);
    const profile = loadWorkflowProfile('feature');
    const base = await resolveContext(envelope, profile, root);
    const scoped = files ? await resolveScopedContext(root, { files, role: 'implementer' }) : undefined;
    const context = { ...base, ...(scoped?.scopedContext ? { scopedContext: scoped.scopedContext } : {}) };
    return { context, compiled: compilePrompt({ role: 'implementer', phase: 'intake', context, promptVersion: 'v1.0.0' }) };
  };

  test('añade una capa rules entre policies y knowledge con los hashes de manifiesto y vista', async () => {
    const { context, compiled } = await compile(['src/a.ts']);
    expect(compiled.layers.map((l) => l.name)).toEqual(['system', 'agent', 'policies', 'rules', 'knowledge', 'ast', 'task', 'output_schema']);
    const layer = compiled.layers.find((l) => l.name === 'rules')!.content;
    expect(layer).toContain('keep public error type');
    expect(layer).toContain(context.scopedContext!.manifest.hash);
    expect(layer).toContain(context.scopedContext!.view.hash);
  });

  test('sin scopedContext el prompt conserva exactamente las siete capas previas', async () => {
    const { compiled } = await compile();
    expect(compiled.layers.map((l) => l.name)).toEqual(['system', 'agent', 'policies', 'knowledge', 'ast', 'task', 'output_schema']);
  });

  test('un contexto con diagnósticos bloqueantes no se compila a prompt', async () => {
    const { context } = await compile(['src/a.ts']);
    const blocked = {
      ...context,
      scopedContext: {
        ...context.scopedContext!,
        manifest: { ...context.scopedContext!.manifest, diagnostics: [{ code: 'rule_conflict', severity: 'blocking' as const, message: 'x' }] },
      },
    };
    expect(() => compilePrompt({ role: 'implementer', phase: 'intake', context: blocked, promptVersion: 'v1' })).toThrow('rule_conflict');
  });
});

describe('ccep compile --files (e2e)', () => {
  const run = (extra: string[]) =>
    invokeCli(['ccep', 'compile', '--command', 'feature', '--phase', 'intake', '--role', 'task-coach', ...extra, 'Add loyalty', '--output=json'], root);

  test('con --files y reglas emite la capa rules', async () => {
    await put('.codeconductor/rules/a.yml', ruleYaml('app.errors.boundary', 'keep public error type'));
    const out = await run(['--files', 'src/a.ts,src/b.ts']);
    expect(out.exitCode).toBe(0);
    const json = JSON.parse(out.stdout);
    expect(json.layers.map((l: { name: string }) => l.name)).toContain('rules');
  });

  test('sin --files no se carga contexto de reglas aunque existan', async () => {
    await put('.codeconductor/rules/a.yml', ruleYaml('app.errors.boundary', 'keep public error type'));
    const json = JSON.parse((await run([])).stdout);
    expect(json.layers).toHaveLength(7);
  });

  test('un conflicto hace fallar el comando con el diagnóstico, sin prompt degradado', async () => {
    await put('.codeconductor/rules/a.yml', ruleYaml('app.x.y', 'A'));
    await put('.codeconductor/rules/b.yml', ruleYaml('app.x.y', 'B'));
    const out = await run(['--files', 'src/a.ts']);
    expect(out.exitCode).toBe(1);
    const json = JSON.parse(out.stdout);
    expect(json.success).toBe(false);
    expect(json.errors.join(' ')).toContain('rule_conflict');
    expect(json.errors.join(' ')).toContain('.codeconductor/rules/a.yml, .codeconductor/rules/b.yml');
    expect(json).not.toHaveProperty('prompt');
  });
});
