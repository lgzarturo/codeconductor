import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openspecCommand } from '../../src/commands/openspec.command';
import { tddCommand } from '../../src/commands/tdd.command';
import type { OpenspecTaskCardInput } from '../../src/validation/schemas';

const FIXTURE = join(import.meta.dir, '../fixtures/backlog/BACKLOG.md');

/** `npm test` fails (exit 1) while a `.fail` marker file exists in the project root. */
export const MARKER_SUITE = `node -e "process.exit(require('fs').existsSync('.fail')?1:0)"`;

export interface TddFlow {
  readonly root: string;
  readonly testCard: OpenspecTaskCardInput;
  readonly implCard: OpenspecTaskCardInput;
}

export async function cleanup(roots: string[]): Promise<void> {
  await Promise.all(roots.map((dir) => rm(dir, { recursive: true, force: true })));
}

export async function os(
  root: string,
  subcommand: string,
  itemId?: string,
): Promise<{ code: number; data?: unknown }> {
  return openspecCommand({ subcommand, itemId, projectRoot: root, output: 'json' });
}

/** Real plan, then start/done of every card before the test card, then start of the test card. */
export async function setupFlow(roots: string[], prefix: string): Promise<TddFlow> {
  const root = join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  await mkdir(root, { recursive: true });
  roots.push(root);
  await writeFile(join(root, 'BACKLOG.md'), await readFile(FIXTURE, 'utf-8'));
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({ name: 'fixture', scripts: { test: MARKER_SUITE } }),
  );

  const planned = await os(root, 'plan', 'BC-001');
  const cards = (planned.data as { taskCards: OpenspecTaskCardInput[] }).taskCards;
  const testCard = cards.find((c) => c.phase === 'test')!;
  const implCard = cards.find((c) => c.phase === 'implement')!;

  for (const card of cards) {
    if (card.phase === 'test') break;
    if ((await os(root, 'start', card.id)).code !== 0) throw new Error(`start ${card.id} failed`);
    if ((await os(root, 'done', card.id)).code !== 0) throw new Error(`done ${card.id} failed`);
  }
  if ((await os(root, 'start', testCard.id)).code !== 0) throw new Error('start test card failed');
  return { root, testCard, implCard };
}

export function capture(root: string, taskId: string, phase: 'red' | 'green') {
  return tddCommand({
    subcommand: 'capture',
    projectRoot: root,
    output: 'json',
    taskId,
    phase,
    command: 'npm test',
  });
}

/** Real RED capture: create `.fail`, run the suite, return the evidence id. */
export async function captureRed(root: string, taskId: string): Promise<string> {
  await writeFile(join(root, '.fail'), '');
  const result = await capture(root, taskId, 'red');
  if (result.code !== 0) throw new Error(`red capture failed: ${JSON.stringify(result.data)}`);
  return (result.data as { evidenceId: string }).evidenceId;
}

export async function captureGreen(root: string, taskId: string): Promise<string> {
  await rm(join(root, '.fail'), { force: true });
  const result = await capture(root, taskId, 'green');
  if (result.code !== 0) throw new Error(`green capture failed: ${JSON.stringify(result.data)}`);
  return (result.data as { evidenceId: string }).evidenceId;
}

export async function touchForeignFile(root: string, content = 'export const ajeno = 1;\n'): Promise<void> {
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, 'src', 'ajeno.ts'), content);
}

export async function cardStatus(root: string, cardId: string): Promise<string | undefined> {
  const state = JSON.parse(
    await readFile(join(root, '.codeconductor', 'openspec-state.json'), 'utf-8'),
  ) as { taskCards: Array<{ id: string; status: string }> };
  return state.taskCards.find((c) => c.id === cardId)?.status;
}

export function validationPath(root: string, cardId: string): string {
  return join(root, '.codeconductor', 'tdd-validations', `${cardId}.json`);
}

export async function readValidation(root: string, cardId: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(validationPath(root, cardId), 'utf-8')) as Record<string, unknown>;
}

export async function readEvidence(root: string, evidenceId: string): Promise<{ data: { rddReceipt: { nonce: string; manifestHash: string } } }> {
  const file = `${evidenceId.replace(/[^A-Za-z0-9_-]/g, '_')}.json`;
  return JSON.parse(await readFile(join(root, '.codeconductor', 'evidence', file), 'utf-8'));
}
