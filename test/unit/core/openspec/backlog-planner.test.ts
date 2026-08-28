import { describe, expect, test } from 'bun:test';
import {
  buildChangeSlug,
  comparePriority,
  getPhaseOrder,
  planTaskCardsForItem,
  selectNextItem,
} from '../../../../src/core/openspec/backlog-planner';
import type { BacklogDocumentInput, BacklogItemInput } from '../../../../src/validation/schemas';

const item = (over: Partial<BacklogItemInput> = {}): BacklogItemInput => ({
  id: 'BC-001',
  title: 'T',
  priority: 'P1',
  status: 'READY',
  type: 'feature',
  dependencies: [],
  description: 'd',
  scope: 's',
  outOfScope: '',
  acceptanceCriteria: ['criterion one'],
  progress: 0,
  ...over,
});

const doc = (items: BacklogItemInput[], tddRequired = true): BacklogDocumentInput => ({
  global: { product: 'P', strategy: 'S', policy: 'PO', reviewRequired: true, tddRequired },
  items,
  archive: [],
});

describe('core/openspec/backlog-planner', () => {
  describe('getPhaseOrder', () => {
    test('puts test before implement when TDD is required', () => {
      expect(getPhaseOrder(doc([], true))).toEqual(['discover', 'design', 'test', 'implement', 'review']);
    });

    test('puts implement before test when TDD is not required', () => {
      expect(getPhaseOrder(doc([], false))).toEqual(['discover', 'design', 'implement', 'test', 'review']);
    });
  });

  describe('planTaskCardsForItem', () => {
    test('creates one chained card per phase', () => {
      const { cards } = planTaskCardsForItem(item(), doc([], true));
      expect(cards).toHaveLength(5);
      expect(cards[0].id).toBe('BC-001-discover');
      expect(cards[0].dependsOn).toEqual([]);
      expect(cards[1].dependsOn).toEqual(['BC-001-discover']);
      expect(cards.map((c) => c.phase)).toEqual(['discover', 'design', 'test', 'implement', 'review']);
      expect(cards.every((c) => typeof c.itemHash === 'string' && c.itemHash.length > 0)).toBe(true);
    });

    test('preserves the status of existing cards when the item hash is unchanged', () => {
      const first = planTaskCardsForItem(item(), doc([], true)).cards;
      const existing = first.map((c) =>
        c.id === 'BC-001-discover' ? { ...c, status: 'done' as const } : c,
      );
      const { cards, invalidatedCards } = planTaskCardsForItem(item(), doc([], true), existing);
      expect(cards[0].status).toBe('done');
      expect(invalidatedCards).toEqual([]);
    });

    test('resets drifted cards when the item snapshot hash changes', () => {
      const first = planTaskCardsForItem(item(), doc([], true)).cards;
      const existing = first.map((c) => ({ ...c, status: 'done' as const }));
      const { cards, invalidatedCards } = planTaskCardsForItem(
        item({ title: 'Changed title' }),
        doc([], true),
        existing,
      );
      expect(cards.every((c) => c.status === 'pending')).toBe(true);
      expect(invalidatedCards).toContain('BC-001-discover');
    });

    test('reports tddRequired phase-order changes and resets leftover cards', () => {
      const tddCards = planTaskCardsForItem(item(), doc([], true)).cards.map((c) => ({
        ...c,
        status: 'done' as const,
      }));
      const { cards, tddImpact, invalidatedCards } = planTaskCardsForItem(
        item(),
        doc([], false),
        tddCards,
      );
      expect(cards.map((c) => c.phase)).toEqual(['discover', 'design', 'implement', 'test', 'review']);
      expect(cards.every((c) => c.status === 'pending')).toBe(true);
      expect(tddImpact?.previousOrder).toEqual(['discover', 'design', 'test', 'implement', 'review']);
      expect(tddImpact?.nextOrder).toEqual(['discover', 'design', 'implement', 'test', 'review']);
      expect(invalidatedCards.length).toBeGreaterThan(0);
    });
  });

  describe('comparePriority', () => {
    test('orders P0 before P2', () => {
      expect(comparePriority(item({ priority: 'P0' }), item({ priority: 'P2' }))).toBeLessThan(0);
    });
  });

  describe('selectNextItem', () => {
    test('selects a READY item with satisfied dependencies', () => {
      const next = selectNextItem(doc([item({ id: 'BC-001', status: 'READY' })]));
      expect(next?.id).toBe('BC-001');
    });

    test('waits until a dependency is DONE', () => {
      const dep = item({ id: 'BC-001', status: 'DONE' });
      const target = item({ id: 'BC-002', status: 'READY', dependencies: ['BC-001'] });
      expect(selectNextItem(doc([dep, target]))?.id).toBe('BC-002');
    });

    test('returns null when nothing is actionable', () => {
      expect(selectNextItem(doc([item({ status: 'TODO' })]))).toBeNull();
    });
  });

  describe('buildChangeSlug', () => {
    test('builds a bc-<num>-<slug> folder name', () => {
      expect(buildChangeSlug(item({ id: 'BC-007', title: 'Add Login Flow!' }))).toBe('bc-007-add-login-flow');
    });
  });
});
