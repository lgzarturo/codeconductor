import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { EscalationReport } from './loop-controller';

export async function writeEscalationReport(
  projectRoot: string,
  taskId: string,
  report: EscalationReport,
): Promise<void> {
  const dir = resolve(projectRoot, '.codeconductor');
  await writeFile(
    resolve(dir, `escalated-${taskId}.json`),
    JSON.stringify(report, null, 2),
    'utf-8',
  );
}
