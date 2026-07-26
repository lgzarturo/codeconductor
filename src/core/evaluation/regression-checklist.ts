import { execSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { ROOT_PRESETS_DIR } from '../presets/package-paths';
import { err, ok, type Result } from '../../utils/result';

export interface RegressionCheckItem {
  id: string;
  required: boolean;
  passed: boolean;
  message: string;
}

export interface RegressionReport {
  passed: boolean;
  checks: RegressionCheckItem[];
  timestamp: string;
}

interface CheckDef {
  id: string;
  command?: string;
  type?: string;
  required?: boolean;
}

/**
 * Load regression checklist template.
 */
export async function loadRegressionChecklist(): Promise<CheckDef[]> {
  try {
    const path = resolve(ROOT_PRESETS_DIR, 'templates', 'regression-checklist.yml');
    const content = await readFile(path, 'utf-8');
    const data = parse(content) as { checks?: CheckDef[] };
    return data.checks ?? [];
  } catch {
    return [
      { id: 'doctor_config', command: 'npx cc-codeconductor doctor', required: false },
    ];
  }
}

/**
 * Run regression checklist against project.
 */
export async function runRegressionChecklist(
  projectRoot: string,
  options: { command?: string } = {}
): Promise<Result<RegressionReport, Error>> {
  try {
    const defs = await loadRegressionChecklist();
    const checks: RegressionCheckItem[] = [];

    for (const def of defs) {
      if (def.type === 'diff_scope') {
        checks.push({
          id: def.id,
          required: def.required ?? false,
          passed: true,
          message: 'diff_scope check requires task context; skipped in CLI (manual in workflow)',
        });
        continue;
      }

      const cmd = options.command && def.id === 'tests_pass' ? options.command : def.command;
      if (!cmd) continue;

      try {
        execSync(cmd, {
          cwd: projectRoot,
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 120000,
        });
        checks.push({
          id: def.id,
          required: def.required ?? true,
          passed: true,
          message: `Command succeeded: ${cmd}`,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        checks.push({
          id: def.id,
          required: def.required ?? true,
          passed: false,
          message: `Command failed: ${cmd} — ${msg.slice(0, 200)}`,
        });
      }
    }

    const report: RegressionReport = {
      passed: checks.every((c) => !c.required || c.passed),
      checks,
      timestamp: new Date().toISOString(),
    };

    const outPath = resolve(projectRoot, '.codeconductor/evaluation/regression-last.json');
    await writeFile(outPath, JSON.stringify(report, null, 2), 'utf-8');

    return ok(report);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}
