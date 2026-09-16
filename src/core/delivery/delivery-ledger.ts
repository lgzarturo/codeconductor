import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { parse, stringify } from 'yaml';
import {
  DeliveryLedgerRequestSchema,
  DeliveryLedgerSchema,
  type DeliveryLedgerInput,
  type DeliveryLedgerRequestInput,
} from '../../validation/schemas';

const DELIVERY_DIR = '.codeconductor/delivery';
const START = '<!-- delivery-ledger-start -->';
const END = '<!-- delivery-ledger-end -->';

function ledgerPath(projectRoot: string, id: string): string {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) throw new Error('Invalid delivery ledger id');
  return resolve(projectRoot, DELIVERY_DIR, `${id}.md`);
}

async function fingerprintWorkspace(projectRoot: string, paths: string[]): Promise<Record<string, string>> {
  const root = resolve(projectRoot);
  const fingerprints: Record<string, string> = {};
  for (const path of paths) {
    const candidate = resolve(root, path);
    if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) {
      fingerprints[path] = 'outside-root';
      continue;
    }
    try {
      fingerprints[path] = createHash('sha256').update(await readFile(candidate)).digest('hex');
    } catch {
      fingerprints[path] = 'missing';
    }
  }
  return fingerprints;
}

function render(ledger: DeliveryLedgerInput): string {
  return `# Delivery Ledger: ${ledger.id}\n\n${START}\n\`\`\`yaml\n${stringify(ledger)}\`\`\`\n${END}\n`;
}

function parseLedger(content: string): DeliveryLedgerInput {
  const match = content.match(/<!-- delivery-ledger-start -->\n```yaml\n([\s\S]*?)```\n<!-- delivery-ledger-end -->/);
  if (!match) throw new Error('Invalid delivery ledger format');
  return DeliveryLedgerSchema.parse(parse(match[1]));
}

export async function loadDeliveryLedger(projectRoot: string, id: string): Promise<DeliveryLedgerInput> {
  return parseLedger(await readFile(ledgerPath(projectRoot, id), 'utf-8'));
}

export async function createDeliveryLedger(
  projectRoot: string,
  input: DeliveryLedgerRequestInput,
): Promise<{ created: boolean; ledger: DeliveryLedgerInput }> {
  const request = DeliveryLedgerRequestSchema.parse(input);
  const path = ledgerPath(projectRoot, request.id);
  try {
    return { created: false, ledger: await loadDeliveryLedger(projectRoot, request.id) };
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('ENOENT')) throw error;
  }

  const now = new Date().toISOString();
  const ledger = DeliveryLedgerSchema.parse({
    version: 1,
    id: request.id,
    taskCard: request.taskCard,
    tasks: request.tasks,
    evidence: request.taskCard.evidenceRequired,
    nextStep: request.nextStep,
    memoryTopicKey: `delivery:${request.id}`,
    workspace: await fingerprintWorkspace(projectRoot, request.taskCard.targetFiles),
    createdAt: now,
    updatedAt: now,
  });
  await mkdir(resolve(projectRoot, DELIVERY_DIR), { recursive: true });
  try {
    await writeFile(path, render(ledger), { encoding: 'utf-8', flag: 'wx' });
    return { created: true, ledger };
  } catch (error) {
    if (error instanceof Error && error.message.includes('EEXIST')) {
      return { created: false, ledger: await loadDeliveryLedger(projectRoot, request.id) };
    }
    throw error;
  }
}

export async function reconcileDeliveryLedger(projectRoot: string, id: string): Promise<{
  ledger: DeliveryLedgerInput;
  changedPaths: string[];
}> {
  const ledger = await loadDeliveryLedger(projectRoot, id);
  const current = await fingerprintWorkspace(projectRoot, Object.keys(ledger.workspace));
  const changedPaths = Object.keys(ledger.workspace).filter((path) => ledger.workspace[path] !== current[path]);
  return { ledger, changedPaths };
}
