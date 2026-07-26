import type {
  BacklogDocumentInput,
  BacklogItemInput,
  OpenspecTaskCardInput,
  OpenspecTaskCardPhaseInput,
} from '../../validation/schemas';
import { routePhaseToAgent } from './agent-router';

const DEFAULT_PHASE_ORDER: OpenspecTaskCardPhaseInput[] = [
  'discover',
  'design',
  'implement',
  'test',
  'review',
];

const TDD_PHASE_ORDER: OpenspecTaskCardPhaseInput[] = [
  'discover',
  'design',
  'test',
  'implement',
  'review',
];

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function phaseTitle(phase: OpenspecTaskCardPhaseInput, item: BacklogItemInput): string {
  const labels: Record<OpenspecTaskCardPhaseInput, string> = {
    discover: 'Discover scope and impact',
    design: 'Technical design',
    implement: 'Implementation',
    test: 'Test coverage',
    review: 'Review and validation',
  };
  return `${item.id}: ${labels[phase]}`;
}

function phasePrompt(phase: OpenspecTaskCardPhaseInput, item: BacklogItemInput): string {
  const base = `Backlog item ${item.id} — ${item.title}\n\nDescription: ${item.description}\nScope: ${item.scope}`;
  switch (phase) {
    case 'discover':
      return `${base}\n\nMap repository structure, conventions, and impact radius for this change.`;
    case 'design':
      return `${base}\n\nProduce a Technical Plan with approach, files affected, risks, and edge cases.`;
    case 'test':
      return `${base}\n\nWrite TDD tests covering acceptance criteria before or after implementation per project policy.`;
    case 'implement':
      return `${base}\n\nImplement the minimal diff to satisfy tests and acceptance criteria.`;
    case 'review':
      return `${base}\n\nVerify acceptance criteria, test coverage, scope alignment, and code quality.`;
  }
}

function phaseAcceptance(
  phase: OpenspecTaskCardPhaseInput,
  item: BacklogItemInput
): string[] {
  switch (phase) {
    case 'discover':
      return ['Repo map identifies relevant files and impact radius'];
    case 'design':
      return ['Technical plan lists files affected and approach'];
    case 'test':
      return item.acceptanceCriteria.map((c) => `Test covers: ${c}`);
    case 'implement':
      return item.acceptanceCriteria;
    case 'review':
      return [
        'All acceptance criteria verified',
        'Tests pass',
        'No scope creep beyond backlog item',
      ];
  }
}

/**
 * Build ordered phase list respecting TDD global policy.
 */
export function getPhaseOrder(doc: BacklogDocumentInput): OpenspecTaskCardPhaseInput[] {
  return doc.global.tddRequired ? [...TDD_PHASE_ORDER] : [...DEFAULT_PHASE_ORDER];
}

/**
 * Generate TaskCards for a single backlog item.
 */
export function planTaskCardsForItem(
  item: BacklogItemInput,
  doc: BacklogDocumentInput,
  existingCards: OpenspecTaskCardInput[] = []
): OpenspecTaskCardInput[] {
  const phases = getPhaseOrder(doc);
  const cards: OpenspecTaskCardInput[] = [];
  let prevId: string | undefined;

  for (const phase of phases) {
    const id = `${item.id}-${phase}`;
    const existing = existingCards.find((c) => c.id === id);
    const route = routePhaseToAgent(phase);
    const dependsOn = prevId ? [prevId] : [];

    cards.push({
      id,
      backlogId: item.id,
      phase,
      title: phaseTitle(phase, item),
      prompt: phasePrompt(phase, item),
      agent: route.agent,
      modelHint: route.modelKey,
      dependsOn,
      acceptanceCriteria: phaseAcceptance(phase, item),
      status: existing?.status ?? 'pending',
    });
    prevId = id;
  }

  return cards;
}

/**
 * Priority sort: P0 first.
 */
export function comparePriority(a: BacklogItemInput, b: BacklogItemInput): number {
  const order = { P0: 0, P1: 1, P2: 2, P3: 3 };
  return order[a.priority] - order[b.priority];
}

/**
 * Select next executable backlog item: READY, not archived, dependencies satisfied.
 */
export function selectNextItem(
  doc: BacklogDocumentInput,
  itemId?: string
): BacklogItemInput | null {
  const doneOrArchived = new Set(
    doc.archive.map((i) => i.id).concat(doc.items.filter((i) => i.status === 'DONE').map((i) => i.id))
  );

  const candidates = doc.items
    .filter((i) => {
      if (itemId) return i.id === itemId;
      if (doneOrArchived.has(i.id)) return false;
      return i.status === 'READY' || i.status === 'PLANNED' || i.status === 'IN_PROGRESS';
    })
    .sort(comparePriority);

  for (const item of candidates) {
    const depsOk = item.dependencies.every((dep) => {
      const depItem = doc.items.find((i) => i.id === dep) ?? doc.archive.find((i) => i.id === dep);
      return depItem?.status === 'DONE' || doc.archive.some((a) => a.id === dep);
    });
    if (depsOk) return item;
  }

  return null;
}

/**
 * Build change folder slug for OpenSpec artifacts.
 */
export function buildChangeSlug(item: BacklogItemInput): string {
  const num = item.id.replace(/^BC-/i, '').toLowerCase();
  const slug = slugify(item.title);
  return `bc-${num}-${slug}`;
}
