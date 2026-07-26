import { describe, expect, test } from 'bun:test';
import {
  findPath,
  linkNodes,
  upsertNode,
  countByType,
} from '../src/core/product-graph/graph-store';
import type { ProductGraphInput } from '../src/validation/schemas';

function emptyGraph(): ProductGraphInput {
  return {
    version: 1,
    productId: 'product:test',
    productName: 'Test',
    nodes: [],
    edges: [],
    updatedAt: new Date().toISOString(),
  };
}

describe('Product graph store', () => {
  test('upsertNode and linkNodes', () => {
    let g = emptyGraph();
    g = upsertNode(g, { id: 'a', type: 'component', name: 'A', data: {} });
    g = upsertNode(g, { id: 'b', type: 'component', name: 'B', data: {} });
    g = linkNodes(g, { from: 'a', to: 'b', relation: 'depends_on' });
    expect(g.nodes.length).toBe(2);
    expect(g.edges.length).toBe(1);
  });

  test('findPath finds connection', () => {
    let g = emptyGraph();
    g = upsertNode(g, { id: 'a', type: 'domain', name: 'A', data: {} });
    g = upsertNode(g, { id: 'b', type: 'component', name: 'B', data: {} });
    g = linkNodes(g, { from: 'a', to: 'b', relation: 'contains' });
    const path = findPath(g, 'a', 'b');
    expect(path).toEqual(['a', 'b']);
  });

  test('countByType aggregates', () => {
    let g = emptyGraph();
    g = upsertNode(g, { id: 'a', type: 'risk', name: 'R1', data: {} });
    g = upsertNode(g, { id: 'b', type: 'risk', name: 'R2', data: {} });
    const counts = countByType(g);
    expect(counts.risk).toBe(2);
  });
});
