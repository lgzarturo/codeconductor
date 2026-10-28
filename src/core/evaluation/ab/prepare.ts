/**
 * Prepare A/B workdirs and prove harness load (dry-run / preflight).
 * Never touches the repo fixture in place — always copies to a temp dir.
 */
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  inspectHarnessPresence,
  installHarnessPreset,
  trustClaudeWorkspace,
  type HarnessPresence,
} from '../bench/host-claude';

export interface AbArmPrep {
  arm: 'sin-arnes' | 'con-arnes';
  cwd: string;
  presence: HarnessPresence;
  ok: boolean;
  detail: string;
}

export interface AbDryRunResult {
  ok: boolean;
  arms: AbArmPrep[];
  workRoot: string;
  messages: string[];
}

/**
 * Copy fixture, optionally install harness, trust workspace, inspect presence.
 * Caller must dispose `workRoot` (or use {@link withAbDryRun}).
 */
export async function prepareAbArm(options: {
  fixtureDir: string;
  withHarness: boolean;
  workRoot?: string;
}): Promise<{ arm: AbArmPrep; workRoot: string }> {
  const workRoot =
    options.workRoot ?? (await mkdtemp(join(tmpdir(), 'cc-ab-prep-')));
  const label = options.withHarness ? 'con-arnes' : 'sin-arnes';
  const cwd = join(workRoot, label);
  await cp(options.fixtureDir, cwd, { recursive: true });
  await trustClaudeWorkspace(cwd);

  let presence: HarnessPresence;
  if (options.withHarness) {
    presence = await installHarnessPreset(cwd);
  } else {
    presence = await inspectHarnessPresence(cwd);
  }

  const expectedLoaded = options.withHarness;
  const ok = presence.loaded === expectedLoaded;
  const detail = options.withHarness
    ? ok
      ? `preset loaded fingerprint=${presence.fingerprint} files=${presence.files.join(',')}`
      : `expected harness loaded; missing=${presence.missing.join(',') || 'none'} trusted=${presence.workspaceTrusted}`
    : ok
      ? `no preset (files=${presence.files.length})`
      : `baseline unexpectedly has harness files: ${presence.files.join(',')}`;

  return {
    workRoot,
    arm: { arm: label, cwd, presence, ok, detail },
  };
}

/** Dry-run both arms offline: con-arnés must load, sin-arnés must not. */
export async function runAbDryRun(fixtureDir: string): Promise<AbDryRunResult> {
  const workRoot = await mkdtemp(join(tmpdir(), 'cc-ab-dry-'));
  const messages: string[] = [];
  try {
    const sin = await prepareAbArm({
      fixtureDir,
      withHarness: false,
      workRoot,
    });
    messages.push(`[sin-arnes] ${sin.arm.detail}`);

    const con = await prepareAbArm({
      fixtureDir,
      withHarness: true,
      workRoot,
    });
    messages.push(`[con-arnes] ${con.arm.detail}`);

    const ok = sin.arm.ok && con.arm.ok;
    if (!ok) {
      messages.push('DRY-RUN FAIL: harness load asymmetry broken');
    } else {
      messages.push('DRY-RUN OK: con-arnes loads preset; sin-arnes does not');
    }
    return { ok, arms: [sin.arm, con.arm], workRoot, messages };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    messages.push(`DRY-RUN FAIL: ${msg}`);
    return { ok: false, arms: [], workRoot, messages };
  }
}

export async function disposeWorkRoot(workRoot: string): Promise<void> {
  await rm(workRoot, { recursive: true, force: true }).catch(() => undefined);
}
