import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parse, stringify } from 'yaml';
import {
  HarnessExperimentSchema,
  HarnessSuiteSchema,
  type HarnessComponentIdInput,
  type HarnessExperimentInput,
  type HarnessSuiteInput,
  type HarnessSuiteTaskInput,
} from '../../validation/schemas';
import { err, ok, type Result } from '../../utils/result';
import { DEFAULT_CONFIG } from '../config/codeconductor-config';
import { writeConfig } from '../config/config-writer';
import { EVAL_DIR, applyHarnessOverlay, variantDirName, variantIdFor } from './harness-catalog';

export const EXPERIMENTS_DIR = 'experiments';

export function experimentDir(projectRoot: string, experimentId: string): string {
  return resolve(projectRoot, EVAL_DIR, EXPERIMENTS_DIR, experimentId);
}

export function experimentYamlPath(projectRoot: string, experimentId: string): string {
  return join(experimentDir(projectRoot, experimentId), 'experiment.yml');
}

export async function loadHarnessSuite(
  projectRoot: string,
  suiteId: string,
  suitePath?: string
): Promise<Result<HarnessSuiteInput & { path: string }, Error>> {
  const candidates = suitePath
    ? [suitePath]
    : [
        resolve(projectRoot, 'eval', 'suites', suiteId, 'suite.yml'),
        resolve(projectRoot, EVAL_DIR, 'suites', suiteId, 'suite.yml'),
      ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      const suite = HarnessSuiteSchema.parse(parse(await readFile(path, 'utf-8')));
      return ok({ ...suite, path });
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }
  return err(new Error(`Harness suite not found: ${suiteId}`));
}

export async function loadExperiment(
  projectRoot: string,
  experimentId: string
): Promise<Result<HarnessExperimentInput, Error>> {
  try {
    const raw = await readFile(experimentYamlPath(projectRoot, experimentId), 'utf-8');
    return ok(HarnessExperimentSchema.parse(parse(raw)));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return err(new Error(`Experiment not found: ${experimentId}`));
    }
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

export async function listExperiments(projectRoot: string): Promise<HarnessExperimentInput[]> {
  const root = resolve(projectRoot, EVAL_DIR, EXPERIMENTS_DIR);
  if (!existsSync(root)) return [];
  const ids = await readdir(root);
  const experiments: HarnessExperimentInput[] = [];
  for (const id of ids) {
    const loaded = await loadExperiment(projectRoot, id);
    if (loaded.success) experiments.push(loaded.data);
  }
  return experiments;
}

function formatTaskCard(task: HarnessSuiteTaskInput, experimentId: string, variantId: string): string {
  return [
    '## Task Card',
    '',
    `**Title:** ${task.title}`,
    `**Type:** ${task.type}`,
    `**Risk:** ${task.risk}`,
    `**Scope:** ${task.scope}`,
    `**suiteTaskId:** ${task.id}`,
    `**experimentId:** ${experimentId}`,
    `**variantId:** ${variantId}`,
    '',
    '### Context',
    '',
    task.prompt,
    '',
    '### Acceptance Criteria',
    '',
    ...task.acceptanceCriteria.map((c) => `- [ ] ${c}`),
    '',
    '### Constraints',
    '',
    '- Stay inside the declared scope.',
    '- Record the outcome with experiment and variant tags.',
    '',
    '### Scoring',
    '',
    'When done:',
    '',
    '```',
    `bun run dev scorecard create --task ${task.id} --from-diff`,
    `bun run dev scorecard record --task ${task.id} --verdict PASS|REVISE|REJECT --score <n> --experiment ${experimentId} --variant ${variantId} --suite-task ${task.id}`,
    '```',
    task.testCommand ? `\nFixture test command: \`${task.testCommand}\`\n` : '',
  ].join('\n');
}

function formatExperimentMarkdown(experiment: HarnessExperimentInput): string {
  return [
    `# Harness experiment ${experiment.id}`,
    '',
    `- Suite: ${experiment.suiteId}`,
    `- Contract: ${experiment.contractVersion}`,
    `- Created: ${experiment.createdAt}`,
    `- Variants: ${experiment.variants.join(', ')}`,
    `- Tasks: ${experiment.suiteTaskIds.join(', ')}`,
    '',
    'This runner does not invoke a model. Execute each run directory with the host',
    'agent, then `scorecard record` with `--experiment` and `--variant`.',
    '',
    'Compare with:',
    '',
    '```',
    `bun run dev scorecard ablation --experiment ${experiment.id}`,
    '```',
    '',
  ].join('\n');
}

export function generateExperimentId(suiteId: string, now = new Date()): string {
  const date = now.toISOString().slice(0, 10).replaceAll('-', '');
  const rand = Math.random().toString(36).slice(2, 6);
  return `abl-${date}-${suiteId}-${rand}`;
}

async function copyFixture(suitePath: string, fixtureDir: string | undefined, dest: string): Promise<void> {
  const source = fixtureDir
    ? resolve(dirname(suitePath), fixtureDir)
    : join(dirname(suitePath), 'fixture');
  await mkdir(dest, { recursive: true });
  if (existsSync(source)) {
    await cp(source, dest, { recursive: true });
  }
}

export interface StartExperimentOptions {
  suiteId: string;
  suitePath?: string;
  components: HarnessComponentIdInput[];
  contractVersion: string;
  experimentId?: string;
}

export async function startHarnessExperiment(
  projectRoot: string,
  options: StartExperimentOptions
): Promise<Result<HarnessExperimentInput, Error>> {
  const suite = await loadHarnessSuite(projectRoot, options.suiteId, options.suitePath);
  if (!suite.success) return suite;

  const experimentId = options.experimentId ?? generateExperimentId(suite.data.id);
  const variants = ['baseline', ...options.components.map((id) => variantIdFor(id))];
  const experiment: HarnessExperimentInput = {
    id: experimentId,
    suiteId: suite.data.id,
    createdAt: new Date().toISOString(),
    contractVersion: options.contractVersion,
    components: options.components,
    variants,
    suiteTaskIds: suite.data.tasks.map((t) => t.id),
    suitePath: suite.data.path,
  };

  const root = experimentDir(projectRoot, experimentId);
  await mkdir(root, { recursive: true });
  await writeFile(experimentYamlPath(projectRoot, experimentId), stringify(experiment), 'utf-8');
  await writeFile(join(root, 'EXPERIMENT.md'), formatExperimentMarkdown(experiment), 'utf-8');

  for (const task of suite.data.tasks) {
    for (const variantId of variants) {
      const runRoot = join(root, 'runs', task.id, variantDirName(variantId));
      await copyFixture(suite.data.path, suite.data.fixtureDir, runRoot);
      await writeConfig(runRoot, structuredClone(DEFAULT_CONFIG), true);
      const disabled = variantId === 'baseline' ? [] : options.components.filter((id) => variantIdFor(id) === variantId);
      const overlay = await applyHarnessOverlay(runRoot, disabled, {
        experimentId,
        variantId,
        contractVersion: options.contractVersion,
        backup: false,
      });
      if (!overlay.success) return overlay;
      await writeFile(join(runRoot, 'TASK.md'), formatTaskCard(task, experimentId, variantId), 'utf-8');
    }
  }

  return ok(experiment);
}

export async function applyExperimentVariant(
  projectRoot: string,
  experimentId: string,
  variantId: string,
  contractVersion: string
): Promise<Result<HarnessExperimentInput, Error>> {
  const loaded = await loadExperiment(projectRoot, experimentId);
  if (!loaded.success) return loaded;
  if (!loaded.data.variants.includes(variantId)) {
    return err(new Error(`Unknown variant ${variantId} for ${experimentId}`));
  }
  const disabled =
    variantId === 'baseline'
      ? []
      : loaded.data.components.filter((id) => variantIdFor(id) === variantId);
  const overlay = await applyHarnessOverlay(projectRoot, disabled, {
    experimentId,
    variantId,
    contractVersion,
    backup: true,
  });
  if (!overlay.success) return overlay;
  return ok(loaded.data);
}
