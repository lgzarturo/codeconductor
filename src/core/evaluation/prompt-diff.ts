import { mkdtemp, readFile, readdir, rm, symlink, lstat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import {
  measureCompiledPrompt,
  formatPromptMetricsMarkdown,
  type PromptMetrics,
  type LayerMetrics,
} from '../ccep/prompt-metrics';
import type { CompiledPrompt, PromptLayer } from '../ccep/prompt-compiler';
import { loadWorkflowProfile } from '../ccep/workflow-profile-loader';
import type { ExecutionContextInput } from '../../validation/schemas';
import { ROOT_PRESETS_DIR, PACKAGE_ROOT } from '../presets/package-paths';

export interface PromptDiffResult {
  fromVersion: string;
  toVersion: string;
  target: string;
  files: Array<{
    path: string;
    changed: boolean;
    addedLines: number;
    removedLines: number;
    hunks: string[];
  }>;
}

export interface CompiledLayerDelta {
  name: string;
  fromSha256: string | null;
  toSha256: string | null;
  deltaBytes: number;
  deltaTokens: number;
  changed: boolean;
}

export interface CompiledPromptDiffResult {
  fromRef: string;
  toRef: string;
  fixture: string;
  from: PromptMetrics;
  to: PromptMetrics;
  deltaDupRatio: number;
  layers: CompiledLayerDelta[];
  promptFingerprintChanged: boolean;
  /** Stable identity of this comparison (for repeatability checks). */
  comparisonId: string;
}

function normalizeVersion(v: string): string {
  return v.startsWith('v') ? v : `v${v}`;
}

async function listPromptFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isFile() && e.name.endsWith('.md')).map((e) => e.name);
  } catch {
    return [];
  }
}

function lineDiff(oldText: string, newText: string, path: string): {
  added: number;
  removed: number;
  hunks: string[];
} {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const hunks: string[] = [];
  let added = 0;
  let removed = 0;

  const max = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < max; i++) {
    const o = oldLines[i];
    const n = newLines[i];
    if (o === n) continue;
    if (o === undefined) {
      added++;
      hunks.push(`+ ${n}`);
    } else if (n === undefined) {
      removed++;
      hunks.push(`- ${o}`);
    } else {
      removed++;
      added++;
      hunks.push(`- ${o}`);
      hunks.push(`+ ${n}`);
    }
  }

  if (hunks.length > 0) {
    hunks.unshift(`### ${path}`);
  }
  return { added, removed, hunks };
}

/**
 * Diff prompt contracts between two versions for a target preset.
 */
export async function diffPromptVersions(
  fromVersion: string,
  toVersion: string,
  options: { target?: string; agent?: string; projectRoot?: string } = {}
): Promise<PromptDiffResult> {
  const target = options.target ?? 'opencode';
  const fromV = normalizeVersion(fromVersion);
  const toV = normalizeVersion(toVersion);

  const searchRoots = [
    resolve(options.projectRoot ?? PACKAGE_ROOT, '.agents', 'prompts'),
    join(ROOT_PRESETS_DIR, target, 'prompts'),
    join(ROOT_PRESETS_DIR, 'opencode', 'prompts'),
  ];

  let fromDir = '';
  let toDir = '';
  for (const root of searchRoots) {
    const f = join(root, fromV);
    const t = join(root, toV);
    try {
      await readFile(join(f, 'orchestrator.md'), 'utf-8');
      fromDir = f;
      toDir = t;
      break;
    } catch {
      // try next root
    }
  }

  if (!fromDir) {
    fromDir = join(ROOT_PRESETS_DIR, 'opencode', 'prompts', fromV);
    toDir = join(ROOT_PRESETS_DIR, 'opencode', 'prompts', toV);
  } else {
    try {
      await readFile(join(toDir, 'orchestrator.md'), 'utf-8');
    } catch {
      toDir = join(ROOT_PRESETS_DIR, 'opencode', 'prompts', toV);
    }
  }

  const fromFiles = await listPromptFiles(fromDir);
  const toFiles = await listPromptFiles(toDir);
  const allNames = new Set([...fromFiles, ...toFiles]);
  if (options.agent) {
    const agentFile = `${options.agent}.md`;
    if (allNames.has(agentFile)) {
      allNames.clear();
      allNames.add(agentFile);
    }
  }

  const files: PromptDiffResult['files'] = [];
  for (const name of allNames) {
    let oldText = '';
    let newText = '';
    try {
      oldText = await readFile(join(fromDir, name), 'utf-8');
    } catch {
      oldText = '';
    }
    try {
      newText = await readFile(join(toDir, name), 'utf-8');
    } catch {
      newText = '';
    }
    const { added, removed, hunks } = lineDiff(oldText, newText, name);
    files.push({
      path: name,
      changed: oldText !== newText,
      addedLines: added,
      removedLines: removed,
      hunks,
    });
  }

  return { fromVersion: fromV, toVersion: toV, target, files };
}

export function formatPromptDiffMarkdown(result: PromptDiffResult): string {
  const lines = [
    `# Prompt diff: ${result.fromVersion} → ${result.toVersion}`,
    '',
    `Target: ${result.target}`,
    '',
  ];
  const changed = result.files.filter((f) => f.changed);
  lines.push(`Changed files: ${changed.length} / ${result.files.length}`, '');
  for (const f of changed) {
    lines.push(`## ${f.path} (+${f.addedLines} -${f.removedLines})`, '');
    lines.push(...f.hunks.slice(0, 40));
    if (f.hunks.length > 40) lines.push('... (truncated)');
    lines.push('');
  }
  return lines.join('\n');
}

/** Fixed harness-v1 compile context (deterministic; no live model). */
export function buildHarnessV1CompileContext(
  options: { projectRoot?: string; taskPrompt?: string } = {},
): {
  role: string;
  phase: string;
  promptVersion: string;
  context: ExecutionContextInput;
  fixtureId: string;
} {
  const profile = loadWorkflowProfile('feature');
  const phase = profile.phases.find((p) => p.id === 'intake') ?? profile.phases[0]!;
  const goal =
    options.taskPrompt ??
    'add(a, b) returns a + b + 1. It must return a + b. (harness-v1 fix-add-off-by-one)';
  const root = options.projectRoot ?? PACKAGE_ROOT;
  const context: ExecutionContextInput = {
    envelope: {
      protocolVersion: 'ccep-1',
      command: 'feature',
      userRequest: goal,
      projectId: 'harness-v1',
      repoContext: { stack: ['typescript'], existingModules: ['src/math.ts'] },
      constraints: {
        outputFormat: 'taskcard',
        needConfirmation: false,
        riskThreshold: 'low',
      },
      executionPolicy: { modelMode: 'structured', maxVariance: 'low' },
    },
    profile,
    intent: { type: 'feature', goal },
    project: { name: 'harness-v1', rootDir: root },
    knowledge: {
      productName: 'harness-v1',
      requirements: ['add(2, 3) returns 5'],
      risks: [],
    },
    ast: { source: 'detect', confidence: 'low' },
    policies: {
      architecture: 'modular',
      testing: 'required',
      documentation: 'required',
      breakingChanges: 'approval',
    },
    outputSchema: phase.outputSchema ?? 'planner-output',
  };
  return {
    role: phase.agent ?? phase.agents?.[0] ?? 'orchestrator',
    phase: phase.id,
    promptVersion: 'v1.0.0',
    context,
    fixtureId: 'eval/suites/harness-v1',
  };
}

function runGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => {
      stdout += c.toString();
    });
    child.stderr.on('data', (c: Buffer) => {
      stderr += c.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolvePromise(stdout.trim());
      else reject(new Error(`git ${args.join(' ')} failed (${code}): ${stderr || stdout}`));
    });
  });
}

async function linkNodeModules(gitRoot: string, worktreePath: string): Promise<void> {
  const src = join(gitRoot, 'node_modules');
  const dest = join(worktreePath, 'node_modules');
  try {
    await lstat(src);
  } catch {
    return;
  }
  try {
    await lstat(dest);
    return;
  } catch {
    // missing — link
  }
  await symlink(src, dest, 'dir');
}

async function withGitWorktree<T>(
  gitRoot: string,
  ref: string,
  fn: (worktreePath: string) => Promise<T>,
): Promise<T> {
  const base = await mkdtemp(join(tmpdir(), 'cc-prompt-diff-'));
  const worktreePath = join(base, ref.replace(/[^A-Za-z0-9._-]/g, '_'));
  try {
    await runGit(['worktree', 'add', '--detach', worktreePath, ref], gitRoot);
    // Worktrees do not include node_modules; link the host install so
    // dynamic imports of the checked-out compiler resolve deps (zod, etc.).
    await linkNodeModules(gitRoot, worktreePath);
    return await fn(worktreePath);
  } finally {
    try {
      await runGit(['worktree', 'remove', '--force', worktreePath], gitRoot);
    } catch {
      // best-effort cleanup
    }
    await rm(base, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Compile inside a worktree via `bun` subprocess so package resolution
 * (zod, etc.) uses the linked node_modules. Returns layer payloads only.
 */
async function compileLayersInWorktree(
  worktreePath: string,
  fixed: ReturnType<typeof buildHarnessV1CompileContext>,
): Promise<CompiledPrompt> {
  const payloadPath = join(worktreePath, '.cc-prompt-diff-input.json');
  const scriptPath = join(worktreePath, '.cc-prompt-diff-compile.mjs');
  await writeFile(
    payloadPath,
    JSON.stringify({
      role: fixed.role,
      phase: fixed.phase,
      promptVersion: fixed.promptVersion,
      context: fixed.context,
    }),
    'utf-8',
  );
  // Tiny ESM runner — imports the checked-out TypeScript compiler via Bun.
  await writeFile(
    scriptPath,
    `
import { readFileSync } from 'node:fs';
import { compilePrompt } from './src/core/ccep/prompt-compiler.ts';
const input = JSON.parse(readFileSync(process.argv[2], 'utf-8'));
const compiled = compilePrompt(input);
process.stdout.write(JSON.stringify({
  layers: compiled.layers,
  prompt: compiled.prompt,
  outputSchema: compiled.outputSchema,
}));
`,
    'utf-8',
  );

  const stdout = await new Promise<string>((resolvePromise, reject) => {
    const child = spawn('bun', ['run', scriptPath, payloadPath], {
      cwd: worktreePath,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (c: Buffer) => {
      out += c.toString();
    });
    child.stderr.on('data', (c: Buffer) => {
      err += c.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolvePromise(out);
      else reject(new Error(`compile in worktree failed (${code}): ${err || out}`));
    });
  });

  const parsed = JSON.parse(stdout) as {
    layers: PromptLayer[];
    prompt: string;
    outputSchema: string;
  };
  return {
    layers: parsed.layers,
    prompt: parsed.prompt,
    outputSchema: parsed.outputSchema,
  };
}

export async function measureCompiledPromptAtRef(
  ref: string,
  options: {
    gitRoot?: string;
    projectRoot?: string;
    /** Use the current tree's compiler (no worktree). */
    useCurrentCompiler?: boolean;
  } = {},
): Promise<{ metrics: PromptMetrics; layers: LayerMetrics[]; ref: string }> {
  const gitRoot = options.gitRoot ?? PACKAGE_ROOT;
  const fixed = buildHarnessV1CompileContext({ projectRoot: options.projectRoot ?? gitRoot });

  if (options.useCurrentCompiler || ref === 'HEAD' || ref === 'current') {
    const { compilePrompt } = await import('../ccep/prompt-compiler');
    const compiled = compilePrompt({
      role: fixed.role,
      phase: fixed.phase,
      context: fixed.context,
      promptVersion: fixed.promptVersion,
    });
    const metrics = await measureCompiledPrompt(compiled);
    return { metrics, layers: metrics.layers, ref };
  }

  return withGitWorktree(gitRoot, ref, async (wt) => {
    const compiled = await compileLayersInWorktree(wt, fixed);
    const metrics = await measureCompiledPrompt(compiled);
    return { metrics, layers: metrics.layers, ref };
  });
}

/**
 * Compile a fixed harness-v1 context with two git refs (worktrees in /tmp)
 * and compare per-layer sha256, bytes/tokens, and dupRatio.
 */
export async function diffCompiledPromptVersions(
  fromRef: string,
  toRef: string,
  options: { gitRoot?: string; projectRoot?: string } = {},
): Promise<CompiledPromptDiffResult> {
  const gitRoot = options.gitRoot ?? PACKAGE_ROOT;
  const from = await measureCompiledPromptAtRef(fromRef, options);
  const to = await measureCompiledPromptAtRef(toRef, options);

  const layerNames = new Set([
    ...from.metrics.layers.map((l) => l.name),
    ...to.metrics.layers.map((l) => l.name),
  ]);
  const layers: CompiledLayerDelta[] = [];
  for (const name of layerNames) {
    const a = from.metrics.layers.find((l) => l.name === name);
    const b = to.metrics.layers.find((l) => l.name === name);
    layers.push({
      name,
      fromSha256: a?.sha256 ?? null,
      toSha256: b?.sha256 ?? null,
      deltaBytes: (b?.bytes ?? 0) - (a?.bytes ?? 0),
      deltaTokens: (b?.tokens ?? 0) - (a?.tokens ?? 0),
      changed: (a?.sha256 ?? null) !== (b?.sha256 ?? null),
    });
  }

  return {
    fromRef,
    toRef,
    fixture: 'eval/suites/harness-v1',
    from: from.metrics,
    to: to.metrics,
    deltaDupRatio: to.metrics.dupRatio - from.metrics.dupRatio,
    layers,
    promptFingerprintChanged:
      from.metrics.promptFingerprint !== to.metrics.promptFingerprint,
    comparisonId: `${from.metrics.promptFingerprint}:${to.metrics.promptFingerprint}`,
  };
}

export function formatCompiledPromptDiffMarkdown(result: CompiledPromptDiffResult): string {
  const lines = [
    `# Compiled prompt diff: ${result.fromRef} → ${result.toRef}`,
    '',
    `Fixture: \`${result.fixture}\``,
    `Fingerprint from: \`${result.from.promptFingerprint}\``,
    `Fingerprint to:   \`${result.to.promptFingerprint}\``,
    `Fingerprint changed: ${result.promptFingerprintChanged ? 'yes' : 'no'}`,
    `Δ dupRatio: ${(result.deltaDupRatio * 100).toFixed(2)} pp`,
    '',
    '| Layer | Δ bytes | Δ tokens | Changed |',
    '| --- | ---: | ---: | --- |',
    ...result.layers.map(
      (l) =>
        `| ${l.name} | ${l.deltaBytes} | ${l.deltaTokens} | ${l.changed ? 'yes' : 'no'} |`,
    ),
    '',
    '## From',
    '',
    formatPromptMetricsMarkdown(result.from),
    '',
    '## To',
    '',
    formatPromptMetricsMarkdown(result.to),
  ];
  return lines.join('\n');
}
