import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  countByType,
  findPath,
  getNeighbors,
  linkNodes,
  loadGraph,
  queryNodes,
  saveGraph,
  upsertNode,
} from '../../../../src/core/product-graph/graph-store';
import { isErr, isOk } from '../../../../src/utils/result';
import type { ProductGraphInput } from '../../../../src/validation/schemas';

const baseGraph = (): ProductGraphInput => ({
  version: 1,
  productId: 'p',
  productName: 'P',
  nodes: [
    { id: 'a', type: 'component', name: 'Alpha', data: { foo: 'bar' } },
    { id: 'b', type: 'component', name: 'Beta', data: {} },
    { id: 'c', type: 'domain', name: 'Gamma', data: {} },
  ],
  edges: [
    { from: 'a', to: 'b', relation: 'depends_on' },
    { from: 'b', to: 'c', relation: 'contains' },
  ],
  updatedAt: '2026-07-26T00:00:00Z',
});

let ROOT: string;

beforeAll(async () => {
  ROOT = await mkdtemp(join(tmpdir(), 'cc-graph-store-'));
});

afterAll(async () => {
  await rm(ROOT, { recursive: true, force: true });
});

describe('core/product-graph/graph-store', () => {
  describe('upsertNode', () => {
    test('adds a new node', () => {
      const g = upsertNode(baseGraph(), { id: 'd', type: 'metric', name: 'Delta', data: {} });
      expect(g.nodes.find((n) => n.id === 'd')).toBeDefined();
      expect(g.nodes).toHaveLength(4);
    });

    test('replaces an existing node by id', () => {
      const g = upsertNode(baseGraph(), { id: 'a', type: 'component', name: 'Alpha v2', data: {} });
      expect(g.nodes).toHaveLength(3);
      expect(g.nodes.find((n) => n.id === 'a')?.name).toBe('Alpha v2');
    });
  });

  describe('linkNodes', () => {
    test('adds a new edge', () => {
      const g = linkNodes(baseGraph(), { from: 'a', to: 'c', relation: 'affects' });
      expect(g.edges).toHaveLength(3);
    });

    test('deduplicates an identical edge', () => {
      const g = linkNodes(baseGraph(), { from: 'a', to: 'b', relation: 'depends_on' });
      expect(g.edges).toHaveLength(2);
    });
  });

  describe('queryNodes', () => {
    test('filters by type', () => {
      expect(queryNodes(baseGraph(), 'component')).toHaveLength(2);
    });

    test('filters by free-text over name, id and data', () => {
      expect(queryNodes(baseGraph(), undefined, 'alpha')).toHaveLength(1);
      expect(queryNodes(baseGraph(), undefined, 'bar')).toHaveLength(1);
    });

    test('returns everything with no filters', () => {
      expect(queryNodes(baseGraph())).toHaveLength(3);
    });
  });

  describe('findPath', () => {
    test('returns a single-node path when from equals to', () => {
      expect(findPath(baseGraph(), 'a', 'a')).toEqual(['a']);
    });

    test('finds a shortest path across edges', () => {
      expect(findPath(baseGraph(), 'a', 'c')).toEqual(['a', 'b', 'c']);
    });

    test('returns null when no path exists', () => {
      const g = baseGraph();
      g.nodes.push({ id: 'z', type: 'risk', name: 'Zeta', data: {} });
      expect(findPath(g, 'a', 'z')).toBeNull();
    });
  });

  describe('countByType', () => {
    test('tallies nodes by type', () => {
      expect(countByType(baseGraph())).toEqual({ component: 2, domain: 1 });
    });
  });

  describe('getNeighbors', () => {
    test('returns neighbors in both directions', () => {
      const neighbors = getNeighbors(baseGraph(), 'b').map((n) => n.id).sort();
      expect(neighbors).toEqual(['a', 'c']);
    });

    test('filters neighbors by relation', () => {
      const neighbors = getNeighbors(baseGraph(), 'b', 'depends_on').map((n) => n.id);
      expect(neighbors).toEqual(['a']);
    });
  });

  describe('saveGraph / loadGraph', () => {
    test('round-trips a graph through disk', async () => {
      const root = await mkdtemp(join(ROOT, 'proj-'));
      const saved = await saveGraph(root, baseGraph());
      expect(isOk(saved)).toBe(true);

      const loaded = await loadGraph(root);
      expect(isOk(loaded)).toBe(true);
      if (isOk(loaded)) {
        expect(loaded.data.nodes).toHaveLength(3);
        expect(loaded.data.productId).toBe('p');
      }
    });

    test('loadGraph returns a helpful error when the graph is missing', async () => {
      const root = await mkdtemp(join(ROOT, 'empty-'));
      const loaded = await loadGraph(root);
      expect(isErr(loaded)).toBe(true);
      if (isErr(loaded)) {
        expect(loaded.error.message).toContain('Product graph not found');
      }
    });

    test('saveGraph rejects an invalid graph', async () => {
      const root = await mkdtemp(join(ROOT, 'bad-'));
      const invalid = { ...baseGraph(), version: 2 } as unknown as ProductGraphInput;
      const result = await saveGraph(root, invalid);
      expect(isErr(result)).toBe(true);
    });
  });
});
