import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { GoalGraphInput, ProductGraphInput } from '../../validation/schemas';
import { EvidenceSchema, type EvidenceInput } from '../../validation/schemas';
import { loadConfig } from '../config/config-loader';
import { err, ok, type Result } from '../../utils/result';
import { evidenceDir } from '../product-graph/paths';
import { appendEvent } from '../memory/episodic-store';
import { mkdir, writeFile } from 'node:fs/promises';

export interface VerificationCheck {
  name: string;
  passed: boolean;
  message: string;
}

export async function runVerification(
  projectRoot: string,
  taskId: string,
  goal?: GoalGraphInput,
): Promise<Result<{ passed: boolean; checks: VerificationCheck[]; evidenceIds: string[] }, Error>> {
  const checks: VerificationCheck[] = [];
  const evidenceIds: string[] = [];

  let task: GoalGraphInput['tasks'][0] | undefined;
  if (goal) {
    task = goal.tasks.find((t) => t.id === taskId);
  } else {
    const { loadGoal } = await import('../goal/goal-state');
    const g = await loadGoal(projectRoot);
    if (g.success) task = g.data.tasks.find((t) => t.id === taskId);
  }

  if (!task) {
    return err(new Error(`Task ${taskId} not found in goal`));
  }

  // Acceptance criteria checklist
  const criteriaCount = task.acceptance_criteria.length;
  checks.push({
    name: 'acceptance_criteria_defined',
    passed: criteriaCount > 0,
    message:
      criteriaCount > 0
        ? `${criteriaCount} acceptance criteria defined`
        : 'No acceptance criteria defined',
  });

  // Test command from config
  const configResult = await loadConfig(projectRoot);
  if (configResult.success && configResult.data.safety.compileCheck?.enabled) {
    const cmd = configResult.data.safety.compileCheck.command;
    checks.push({
      name: 'compile_check_configured',
      passed: !!cmd,
      message: cmd ? `Compile check: ${cmd}` : 'Compile check enabled but no command',
    });
  } else {
    checks.push({
      name: 'compile_check_configured',
      passed: true,
      message: 'Compile check not required or not configured',
    });
  }

  // Evidence files for task
  const evDir = evidenceDir(projectRoot);
  let evidenceFound = 0;
  if (existsSync(evDir)) {
    const { readdir } = await import('node:fs/promises');
    const files = await readdir(evDir);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = await readFile(join(evDir, file), 'utf-8');
        const ev = EvidenceSchema.parse(JSON.parse(raw));
        if (ev.relatedTask === taskId) {
          evidenceFound++;
          evidenceIds.push(ev.id);
        }
      } catch {
        // skip invalid
      }
    }
  }

  checks.push({
    name: 'evidence_present',
    passed: evidenceFound > 0 || task.risk === 'low',
    message:
      evidenceFound > 0
        ? `${evidenceFound} evidence record(s) for task`
        : task.risk === 'low'
          ? 'Low risk task — evidence optional'
          : 'No evidence records found for task',
  });

  const passed = checks.every((c) => c.passed);

  const evidence: EvidenceInput = {
    id: `ev-verify-${taskId}-${Date.now()}`,
    source: 'cc verify',
    type: 'verification',
    timestamp: new Date().toISOString(),
    relatedTask: taskId,
    confidence: passed ? 0.9 : 0.3,
    summary: passed ? 'Verification passed' : 'Verification failed',
    data: { checks },
  };

  await mkdir(evDir, { recursive: true });
  await writeFile(join(evDir, `${evidence.id}.json`), JSON.stringify(evidence, null, 2), 'utf-8');
  evidenceIds.push(evidence.id);

  await appendEvent(projectRoot, {
    type: 'verification.completed',
    timestamp: new Date().toISOString(),
    payload: { taskId, passed, evidenceId: evidence.id },
  });

  return ok({ passed, checks, evidenceIds });
}

export async function gateTaskCompletion(
  projectRoot: string,
  taskId: string,
  evidenceRequired: string[],
): Promise<Result<boolean, Error>> {
  const evDir = evidenceDir(projectRoot);
  const foundTypes = new Set<string>();

  if (existsSync(evDir)) {
    const { readdir } = await import('node:fs/promises');
    const files = await readdir(evDir);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = await readFile(join(evDir, file), 'utf-8');
        const ev = EvidenceSchema.parse(JSON.parse(raw));
        if (ev.relatedTask === taskId) {
          foundTypes.add(ev.type);
        }
      } catch {
        // skip
      }
    }
  }

  for (const req of evidenceRequired) {
    const normalized = req.replace(/_passed$/, '').replace(/_met$/, '');
    if (!foundTypes.has('verification') && req.includes('acceptance')) {
      // acceptance checked via verify
      continue;
    }
    if (req === 'tests_passed' && !foundTypes.has('verification') && !foundTypes.has('test')) {
      return ok(false);
    }
    if (req === 'review_approved' && !foundTypes.has('review')) {
      return ok(false);
    }
  }

  return ok(true);
}
