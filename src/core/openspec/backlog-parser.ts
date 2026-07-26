import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type {
  BacklogDocumentInput,
  BacklogGlobalInput,
  BacklogItemInput,
} from '../../validation/schemas';
import { err, ok, type Result } from '../../utils/result';

const BACKLOG_FILE = 'BACKLOG.md';
const ITEM_HEADER_RE = /^###\s+(?:\[[^\]]+\]\s*)*(BC-\d{3,})\s*(?:\||-)\s*(.+)$/i;
const GLOBAL_SECTION_RE = /^##\s+Global\s*$/i;
const ITEMS_SECTION_RE = /^##\s+Items\s*$/i;
const ARCHIVE_SECTION_RE = /^##\s+Archive\s*$/i;
const FIELD_RE = /^-\s+([^:]+):\s*(.*)$/;

type Section = 'none' | 'global' | 'items' | 'archive';

function parseBool(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === 'yes' || v === 'true';
}

function parseDependencies(value: string): string[] {
  const v = value.trim().toLowerCase();
  if (!v || v === 'none') return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function parseProgress(value: string): number {
  const match = value.trim().match(/^(\d+)%?$/);
  if (!match) return 0;
  const n = parseInt(match[1], 10);
  return Math.min(100, Math.max(0, n));
}

function parseAcceptanceLines(lines: string[], startIndex: number): { criteria: string[]; nextIndex: number } {
  const criteria: string[] = [];
  let i = startIndex;
  while (i < lines.length) {
    const line = lines[i];
    if (line.match(/^-\s+\w+:/) || line.match(/^###\s+/) || line.match(/^##\s+/)) break;
    const checkbox = line.match(/^(\s*)-\s+\[[ xX]\]\s*(.+)$/);
    const bullet = line.match(/^(\s*)-\s+(.+)$/);
    if (checkbox) {
      criteria.push(checkbox[2].trim());
      i++;
    } else if (bullet && bullet[1].length > 0) {
      criteria.push(bullet[2].trim());
      i++;
    } else if (line.trim() === '') {
      i++;
    } else {
      break;
    }
  }
  return { criteria, nextIndex: i };
}

function parseGlobalField(key: string, value: string, global: Partial<BacklogGlobalInput>): void {
  const k = key.trim().toLowerCase();
  if (k === 'product') global.product = value.trim();
  else if (k === 'strategy') global.strategy = value.trim();
  else if (k === 'policy') global.policy = value.trim();
  else if (k === 'review required') global.reviewRequired = parseBool(value);
  else if (k === 'tdd required') global.tddRequired = parseBool(value);
}

function emptyItem(id: string, title: string): BacklogItemInput {
  return {
    id,
    title,
    priority: 'P2',
    status: 'TODO',
    type: 'feature',
    dependencies: [],
    description: '',
    scope: '',
    outOfScope: '',
    acceptanceCriteria: [],
    progress: 0,
  };
}

function parseItemField(
  key: string,
  value: string,
  item: BacklogItemInput,
  lines: string[],
  lineIndex: number
): number {
  const k = key.trim().toLowerCase();
  if (k === 'priority') item.priority = value.trim() as BacklogItemInput['priority'];
  else if (k === 'status') item.status = value.trim().toUpperCase() as BacklogItemInput['status'];
  else if (k === 'type') item.type = value.trim() as BacklogItemInput['type'];
  else if (k === 'owner') item.owner = value.trim();
  else if (k === 'depends on') item.dependencies = parseDependencies(value);
  else if (k === 'description') item.description = value.trim();
  else if (k === 'scope') item.scope = value.trim();
  else if (k === 'out of scope') item.outOfScope = value.trim();
  else if (k === 'business value') item.businessValue = value.trim();
  else if (k === 'risks') item.risks = value.trim();
  else if (k === 'progress') item.progress = parseProgress(value);
  else if (k === 'branch') item.branch = value.trim();
  else if (k === 'reviewer') item.reviewer = value.trim();
  else if (k === 'last update') item.lastUpdate = value.trim();
  else if (k === 'acceptance') {
    const { criteria, nextIndex } = parseAcceptanceLines(lines, lineIndex + 1);
    item.acceptanceCriteria = criteria;
    return nextIndex - 1;
  }
  return lineIndex;
}

/**
 * Parse BACKLOG.md markdown into a typed BacklogDocument.
 */
export function parseBacklogMarkdown(content: string): Result<BacklogDocumentInput, Error> {
  try {
    const lines = content.split('\n');
    let section: Section = 'none';
    const global: Partial<BacklogGlobalInput> = {};
    const items: BacklogItemInput[] = [];
    const archive: BacklogItemInput[] = [];
    let currentItem: BacklogItemInput | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (GLOBAL_SECTION_RE.test(line)) {
        section = 'global';
        currentItem = null;
        continue;
      }
      if (ITEMS_SECTION_RE.test(line)) {
        section = 'items';
        currentItem = null;
        continue;
      }
      if (ARCHIVE_SECTION_RE.test(line)) {
        section = 'archive';
        currentItem = null;
        continue;
      }

      const headerMatch = line.match(ITEM_HEADER_RE);
      if (headerMatch) {
        const id = headerMatch[1].toUpperCase();
        const title = headerMatch[2].trim();
        currentItem = emptyItem(id, title);
        if (section === 'archive') archive.push(currentItem);
        else if (section === 'items') items.push(currentItem);
        continue;
      }

      const fieldMatch = line.match(FIELD_RE);
      if (!fieldMatch) continue;

      const [, key, value] = fieldMatch;
      if (section === 'global') {
        parseGlobalField(key, value, global);
      } else if (currentItem && (section === 'items' || section === 'archive')) {
        i = parseItemField(key, value, currentItem, lines, i);
      }
    }

    if (!global.product || !global.strategy || !global.policy) {
      return err(new Error('BACKLOG.md missing required Global fields (Product, Strategy, Policy)'));
    }

    const document: BacklogDocumentInput = {
      global: {
        product: global.product,
        strategy: global.strategy,
        policy: global.policy,
        reviewRequired: global.reviewRequired ?? true,
        tddRequired: global.tddRequired ?? true,
      },
      items,
      archive,
    };

    return ok(document);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

/**
 * Read and parse BACKLOG.md from project root.
 */
export async function loadBacklog(projectRoot: string): Promise<Result<BacklogDocumentInput, Error>> {
  try {
    const filePath = resolve(projectRoot, BACKLOG_FILE);
    const content = await readFile(filePath, 'utf-8');
    return parseBacklogMarkdown(content);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

export const BACKLOG_FILENAME = BACKLOG_FILE;
