import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parse, stringify } from 'yaml';
import {
  HarnessCatalogSchema,
  HarnessOverlaySchema,
  type HarnessCatalogInput,
  type HarnessComponentIdInput,
  type HarnessOverlayInput,
  type WorkflowProfileInput,
} from '../../validation/schemas';
import { DEFAULT_CONFIG, type CodeConductorConfig } from '../config/codeconductor-config';
import { loadConfig } from '../config/config-loader';
import { writeConfig } from '../config/config-writer';
import { loadWorkflowProfile } from '../ccep/workflow-profile-loader';
import { err, ok, type Result } from '../../utils/result';

export const EVAL_DIR = '.codeconductor/evaluation';
export const ACTIVE_OVERLAY_FILE = 'active-overlay.yml';
export const CATALOG_FILE = 'harness-catalog.yml';
export const OVERLAY_BACKUP_DIR = 'overlay-backup';

const WORKFLOW_OVERLAY_COMMANDS = ['feature', 'fix', 'refactor', 'council'] as const;

const PHASE_BY_COMPONENT: Partial<Record<HarnessComponentIdInput, string>> = {
  wayfinding: 'wayfinding',
  intake: 'intake',
  design: 'design',
  test_first: 'test',
  review: 'review',
  docs: 'docs',
};

export const DEFAULT_HARNESS_CATALOG: HarnessCatalogInput = {
  version: 1,
  components: [
    {
      id: 'wayfinding',
      layer: 'phase',
      label: 'Wayfinding (repo-explorer)',
      defaultOn: true,
      toggle: { kind: 'ccep_phase', phaseId: 'wayfinding' },
    },
    {
      id: 'intake',
      layer: 'phase',
      label: 'Intake (task-coach)',
      defaultOn: true,
      toggle: { kind: 'ccep_phase', phaseId: 'intake' },
    },
    {
      id: 'design',
      layer: 'phase',
      label: 'Design (architect)',
      defaultOn: true,
      toggle: { kind: 'ccep_phase', phaseId: 'design' },
    },
    {
      id: 'test_first',
      layer: 'phase',
      label: 'Test-first (tester before implement)',
      defaultOn: true,
      toggle: { kind: 'ccep_phase', phaseId: 'test' },
    },
    {
      id: 'review',
      layer: 'phase',
      label: 'Review (reviewer)',
      defaultOn: true,
      toggle: { kind: 'ccep_phase', phaseId: 'review' },
    },
    {
      id: 'docs',
      layer: 'phase',
      label: 'Docs',
      defaultOn: true,
      toggle: { kind: 'ccep_phase', phaseId: 'docs' },
    },
    {
      id: 'confirmation_gates',
      layer: 'gate',
      label: 'Confirmation / stop gates',
      defaultOn: true,
      toggle: { kind: 'ccep_gates' },
    },
    {
      id: 'compile_loop',
      layer: 'loop',
      label: 'Compile-fix loop',
      defaultOn: true,
      toggle: { kind: 'config_loop' },
    },
    {
      id: 'council',
      layer: 'council',
      label: 'Council deliberation and review',
      defaultOn: true,
      toggle: { kind: 'config_council' },
    },
    {
      id: 'product_graph',
      layer: 'knowledge',
      label: 'Product-graph knowledge layer',
      defaultOn: true,
      toggle: { kind: 'product_graph' },
    },
  ],
};

export function catalogIds(catalog: HarnessCatalogInput = DEFAULT_HARNESS_CATALOG): HarnessComponentIdInput[] {
  return catalog.components.map((c) => c.id);
}

export function isHarnessComponentId(value: string): value is HarnessComponentIdInput {
  return catalogIds().includes(value as HarnessComponentIdInput);
}

export function parseComponentsFlag(
  raw: string | undefined,
  catalog: HarnessCatalogInput = DEFAULT_HARNESS_CATALOG
): Result<HarnessComponentIdInput[], Error> {
  if (!raw || raw.trim() === '' || raw.trim() === 'all') {
    return ok(catalogIds(catalog));
  }
  const ids: HarnessComponentIdInput[] = [];
  for (const part of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
    if (!isHarnessComponentId(part)) {
      return err(new Error(`Unknown harness component: ${part}`));
    }
    ids.push(part);
  }
  return ok(ids);
}

export function variantIdFor(component?: HarnessComponentIdInput | null): string {
  return component ? `minus:${component}` : 'baseline';
}

export function parseVariantId(variantId: string): HarnessComponentIdInput[] {
  if (!variantId || variantId === 'baseline') return [];
  if (variantId.startsWith('minus:')) {
    const id = variantId.slice('minus:'.length);
    return isHarnessComponentId(id) ? [id] : [];
  }
  return [];
}

export function variantDirName(variantId: string): string {
  return variantId.replaceAll(':', '-');
}

export function componentStates(
  disabled: readonly string[],
  catalog: HarnessCatalogInput = DEFAULT_HARNESS_CATALOG
): Record<string, boolean> {
  const off = new Set(disabled);
  const states: Record<string, boolean> = {};
  for (const entry of catalog.components) {
    states[entry.id] = entry.defaultOn && !off.has(entry.id);
  }
  return states;
}

export function harnessFingerprint(
  disabled: readonly string[],
  contractVersion: string,
  ccepProfile = 'feature',
  catalog: HarnessCatalogInput = DEFAULT_HARNESS_CATALOG
): string {
  const states = componentStates(disabled, catalog);
  const payload = {
    components: Object.fromEntries(Object.entries(states).sort(([a], [b]) => a.localeCompare(b))),
    contractVersion,
    ccepProfile,
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
}

export async function loadHarnessCatalog(projectRoot: string): Promise<HarnessCatalogInput> {
  const overridePath = resolve(projectRoot, EVAL_DIR, CATALOG_FILE);
  try {
    const raw = await readFile(overridePath, 'utf-8');
    return HarnessCatalogSchema.parse(parse(raw));
  } catch {
    return DEFAULT_HARNESS_CATALOG;
  }
}

export function activeOverlayPath(projectRoot: string): string {
  return resolve(projectRoot, EVAL_DIR, ACTIVE_OVERLAY_FILE);
}

export async function readActiveOverlay(projectRoot: string): Promise<HarnessOverlayInput | null> {
  try {
    const raw = await readFile(activeOverlayPath(projectRoot), 'utf-8');
    return HarnessOverlaySchema.parse(parse(raw));
  } catch {
    return null;
  }
}

export function isProductGraphDisabled(projectRoot: string): boolean {
  try {
    const path = activeOverlayPath(projectRoot);
    if (!existsSync(path)) return false;
    const overlay = HarnessOverlaySchema.parse(parse(readFileSync(path, 'utf-8')));
    return overlay.disableProductGraph === true || overlay.disabledComponents.includes('product_graph');
  } catch {
    return false;
  }
}

function cloneProfile(profile: WorkflowProfileInput): WorkflowProfileInput {
  return structuredClone(profile);
}

function dropPhase(profile: WorkflowProfileInput, phaseId: string): void {
  profile.routing.default = profile.routing.default.filter((id) => id !== phaseId);
  if (profile.routing.riskRules) {
    for (const rule of profile.routing.riskRules) {
      rule.then = rule.then.filter((id) => id !== phaseId);
    }
  }
}

function disableGates(profile: WorkflowProfileInput): void {
  profile.confirmationGate.stopOnHighRisk = false;
  profile.confirmationGate.stopOnQuestions = false;
  for (const phase of profile.phases) {
    delete phase.stopGate;
  }
}

function disableCouncilPhases(profile: WorkflowProfileInput): void {
  for (const phaseId of ['deliberation', 'council-review']) {
    dropPhase(profile, phaseId);
  }
}

export function applyCatalogToProfile(
  profile: WorkflowProfileInput,
  disabled: readonly HarnessComponentIdInput[]
): WorkflowProfileInput {
  const next = cloneProfile(profile);
  for (const id of disabled) {
    const phaseId = PHASE_BY_COMPONENT[id];
    if (phaseId) dropPhase(next, phaseId);
    if (id === 'confirmation_gates') disableGates(next);
    if (id === 'council') disableCouncilPhases(next);
  }
  return next;
}

async function restoreOverlayBackup(projectRoot: string): Promise<void> {
  const backupRoot = resolve(projectRoot, EVAL_DIR, OVERLAY_BACKUP_DIR);
  if (!existsSync(backupRoot)) return;

  const configBackup = join(backupRoot, 'config.yml');
  const configDest = resolve(projectRoot, '.codeconductor', 'config.yml');
  if (existsSync(configBackup)) {
    await mkdir(dirname(configDest), { recursive: true });
    await copyFile(configBackup, configDest);
  }

  const workflowsBackup = join(backupRoot, 'workflows');
  const workflowsDest = resolve(projectRoot, '.codeconductor', 'workflows');
  if (existsSync(workflowsBackup)) {
    await mkdir(workflowsDest, { recursive: true });
    const files = await readdir(workflowsBackup);
    for (const file of files) {
      await copyFile(join(workflowsBackup, file), join(workflowsDest, file));
    }
  }

  const overlayBackup = join(backupRoot, ACTIVE_OVERLAY_FILE);
  const overlayDest = activeOverlayPath(projectRoot);
  if (existsSync(overlayBackup)) {
    await copyFile(overlayBackup, overlayDest);
  } else if (existsSync(overlayDest)) {
    await rm(overlayDest, { force: true });
  }
}

async function snapshotForBackup(projectRoot: string): Promise<void> {
  const backupRoot = resolve(projectRoot, EVAL_DIR, OVERLAY_BACKUP_DIR);
  if (existsSync(backupRoot)) return;

  await mkdir(backupRoot, { recursive: true });
  const configPath = resolve(projectRoot, '.codeconductor', 'config.yml');
  if (existsSync(configPath)) {
    await copyFile(configPath, join(backupRoot, 'config.yml'));
  }
  const workflowsDir = resolve(projectRoot, '.codeconductor', 'workflows');
  if (existsSync(workflowsDir)) {
    const dest = join(backupRoot, 'workflows');
    await mkdir(dest, { recursive: true });
    const files = await readdir(workflowsDir);
    for (const file of files) {
      if (file.endsWith('.yml')) {
        await copyFile(join(workflowsDir, file), join(dest, file));
      }
    }
  }
  const overlay = activeOverlayPath(projectRoot);
  if (existsSync(overlay)) {
    await copyFile(overlay, join(backupRoot, ACTIVE_OVERLAY_FILE));
  }
}

export interface ApplyOverlayOptions {
  experimentId?: string;
  variantId?: string;
  contractVersion?: string;
  ccepProfile?: string;
  backup?: boolean;
}

export async function applyHarnessOverlay(
  projectRoot: string,
  disabled: readonly HarnessComponentIdInput[],
  options: ApplyOverlayOptions = {}
): Promise<Result<HarnessOverlayInput, Error>> {
  try {
    if (options.backup) {
      await restoreOverlayBackup(projectRoot);
      await snapshotForBackup(projectRoot);
    }

    const workflowsDir = resolve(projectRoot, '.codeconductor', 'workflows');
    await mkdir(workflowsDir, { recursive: true });
    await mkdir(resolve(projectRoot, EVAL_DIR), { recursive: true });

    for (const command of WORKFLOW_OVERLAY_COMMANDS) {
      const base = loadWorkflowProfile(command);
      const next = applyCatalogToProfile(base, disabled);
      await writeFile(join(workflowsDir, `${command}.yml`), stringify(next), 'utf-8');
    }

    const needsConfig = disabled.includes('compile_loop') || disabled.includes('council');
    if (needsConfig) {
      const loaded = await loadConfig(projectRoot);
      const current: CodeConductorConfig = loaded.success ? loaded.data : structuredClone(DEFAULT_CONFIG);
      if (disabled.includes('compile_loop')) {
        current.loop = { ...current.loop, enabled: false };
      }
      if (disabled.includes('council')) {
        current.presets = {
          ...current.presets,
          council: { ...current.presets.council, enabled: false },
        };
      }
      const write = await writeConfig(projectRoot, current, true);
      if (!write.success) {
        return err(write.error);
      }
    }

    const overlay = HarnessOverlaySchema.parse({
      experimentId: options.experimentId,
      variantId: options.variantId ?? (disabled[0] ? variantIdFor(disabled[0]) : 'baseline'),
      disabledComponents: [...disabled],
      disableProductGraph: disabled.includes('product_graph'),
      contractVersion: options.contractVersion,
      ccepProfile: options.ccepProfile ?? 'feature',
    });
    await writeFile(activeOverlayPath(projectRoot), stringify(overlay), 'utf-8');
    return ok(overlay);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

export async function currentFingerprint(
  projectRoot: string,
  contractVersion: string
): Promise<{ fingerprint: string; overlay: HarnessOverlayInput | null; states: Record<string, boolean> }> {
  const catalog = await loadHarnessCatalog(projectRoot);
  const overlay = await readActiveOverlay(projectRoot);
  const disabled = overlay?.disabledComponents ?? [];
  return {
    fingerprint: harnessFingerprint(disabled, overlay?.contractVersion ?? contractVersion, overlay?.ccepProfile ?? 'feature', catalog),
    overlay,
    states: componentStates(disabled, catalog),
  };
}
