import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, writeFile, chmod } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { EvidenceSchema, type EvidenceInput } from '../validation/schemas';
import { evidenceDir } from '../core/product-graph/paths';
import {
  captureReceipt,
  collectReceiptPaths,
  isRddReceipt,
  verifyReceipt,
  type RddPhase,
} from '../core/verification/rdd-receipt';

export interface RddOptions {
  readonly subcommand: 'capture' | 'verify' | 'status' | 'git-check' | 'install-hooks';
  readonly projectRoot: string;
  readonly taskId?: string;
  readonly receiptId?: string;
  readonly phase?: RddPhase;
  readonly paths?: readonly string[];
  readonly outcome?: 'passed' | 'failed';
  readonly command?: string;
}

const execFileAsync = promisify(execFile);

function receiptPath(projectRoot: string, id: string): string {
  const directory = resolve(evidenceDir(projectRoot));
  const path = resolve(directory, `${id.replace(/[^A-Za-z0-9_-]/g, '_')}.json`);
  if (dirname(path) !== directory) throw new Error(`Invalid RDD receipt id: ${id}`);
  return path;
}

async function loadReceipt(projectRoot: string, id: string): Promise<{ evidence: EvidenceInput; receipt: ReturnType<typeof assertReceipt> }> {
  const raw = await readFile(receiptPath(projectRoot, id), 'utf-8');
  const evidence = EvidenceSchema.parse(JSON.parse(raw));
  if (evidence.type !== 'rdd') throw new Error(`Evidence "${id}" is not an RDD receipt`);
  return { evidence, receipt: assertReceipt(evidence.data?.rddReceipt) };
}

function assertReceipt(value: unknown) {
  if (!isRddReceipt(value)) throw new Error('RDD receipt payload is invalid');
  return value;
}

interface RddStatusEntry {
  readonly id: string;
  readonly taskId?: string;
  readonly phase: RddPhase;
  readonly timestamp: string;
  readonly valid: boolean;
  readonly changedPaths: readonly string[];
}

export async function rddStatus(projectRoot: string, taskId?: string): Promise<RddStatusEntry[]> {
  const directory = evidenceDir(projectRoot);
  if (!existsSync(directory)) return [];
  const receipts: RddStatusEntry[] = [];
  for (const file of await readdir(directory)) {
    if (!file.endsWith('.json')) continue;
    try {
      const id = file.slice(0, -'.json'.length);
      const { evidence, receipt } = await loadReceipt(projectRoot, id);
      if (taskId && evidence.relatedTask !== taskId) continue;
      const verification = await verifyReceipt(projectRoot, receipt);
      receipts.push({
        id: evidence.id,
        taskId: evidence.relatedTask,
        phase: receipt.phase,
        timestamp: evidence.timestamp,
        valid: verification.valid,
        changedPaths: verification.changedPaths,
      });
    } catch {
      // Non-RDD evidence and unreadable files are not RDD status entries.
    }
  }
  return receipts.sort((left, right) => right.timestamp.localeCompare(left.timestamp));
}

async function installHooks(projectRoot: string): Promise<{ installed: string[]; skipped: string[] }> {
  const { stdout } = await execFileAsync('git', ['rev-parse', '--git-path', 'hooks'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  const hooksDir = resolve(projectRoot, stdout.trim());
  await mkdir(hooksDir, { recursive: true });
  const installed: string[] = [];
  const skipped: string[] = [];
  for (const hook of ['pre-commit', 'pre-push']) {
    const path = resolve(hooksDir, hook);
    const backup = resolve(hooksDir, `${hook}.rdd-original`);
    const marker = '# codeconductor-rdd-hook';
    if (existsSync(path)) {
      const existing = await readFile(path, 'utf8');
      if (existing.includes(marker)) {
        skipped.push(hook);
        continue;
      }
      if (existsSync(backup)) {
        throw new Error(`Cannot preserve ${hook}: ${backup} already exists`);
      }
      await rename(path, backup);
    }
    const script = `#!/bin/sh\n${marker}\nset -e\nHOOK_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"\nif [ -x "$HOOK_DIR/${hook}.rdd-original" ]; then\n  "$HOOK_DIR/${hook}.rdd-original" "$@"\nfi\ncc-codeconductor rdd git-check\n`;
    await writeFile(path, script, 'utf8');
    await chmod(path, 0o755);
    installed.push(hook);
  }
  return { installed, skipped };
}

export async function rddCommand(options: RddOptions): Promise<{ code: number; data: unknown }> {
  try {
    if (options.subcommand === 'capture') {
      if (!options.taskId) throw new Error('Missing task id. Use --task <id>.');
      const protectedPaths = options.paths?.length
        ? options.paths
        : await collectReceiptPaths(options.projectRoot);
      const receipt = await captureReceipt(options.projectRoot, {
        taskId: options.taskId,
        phase: options.phase ?? 'verification',
        paths: protectedPaths,
        outcome: options.outcome ?? 'passed',
        command: options.command,
        coverage: options.paths?.length ? 'paths' : 'project',
      });
      const id = `ev-rdd-${options.taskId}-${Date.now()}`;
      const evidence: EvidenceInput = {
        id,
        source: 'cc rdd',
        type: 'rdd',
        timestamp: new Date().toISOString(),
        relatedTask: options.taskId,
        confidence: 0.9,
        summary: `RDD ${receipt.phase} receipt captured`,
        data: { rddReceipt: receipt },
      };
      const directory = evidenceDir(options.projectRoot);
      await mkdir(directory, { recursive: true });
      await writeFile(receiptPath(options.projectRoot, id), JSON.stringify(evidence, null, 2), 'utf-8');
      return { code: 0, data: { success: true, receiptId: id, receipt } };
    }

    if (options.subcommand === 'verify') {
      if (!options.receiptId) throw new Error('Missing receipt id. Use --receipt <id>.');
      const { receipt } = await loadReceipt(options.projectRoot, options.receiptId);
      const verification = await verifyReceipt(options.projectRoot, receipt);
      return {
        code: verification.valid ? 0 : 1,
        data: { success: verification.valid, receiptId: options.receiptId, ...verification },
      };
    }

    if (options.subcommand === 'status') {
      return { code: 0, data: { success: true, receipts: await rddStatus(options.projectRoot, options.taskId) } };
    }

    if (options.subcommand === 'git-check') {
      const current = (await rddStatus(options.projectRoot))[0];
      if (!current) return { code: 1, data: { success: false, errors: ['No RDD receipt exists for the Git candidate.'] } };
      return current.valid
        ? { code: 0, data: { success: true, receiptId: current.id } }
        : { code: 1, data: { success: false, receiptId: current.id, changedPaths: current.changedPaths } };
    }

    return { code: 0, data: { success: true, ...(await installHooks(options.projectRoot)) } };
  } catch (error) {
    return { code: 1, data: { success: false, errors: [error instanceof Error ? error.message : String(error)] } };
  }
}
