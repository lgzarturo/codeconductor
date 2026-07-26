import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ProductNodeType } from '../../domain/product/entities';
import {
  ProductGraphSchema,
  type ProductGraphInput,
  type ProductGraphNodeInput,
  type ProductGraphEdgeInput,
} from '../../validation/schemas';
import { err, ok, type Result } from '../../utils/result';
import { productGraphPath } from './paths';

export async function loadGraph(projectRoot: string): Promise<Result<ProductGraphInput, Error>> {
  try {
    const raw = await readFile(productGraphPath(projectRoot), 'utf-8');
    return ok(ProductGraphSchema.parse(JSON.parse(raw)));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return err(new Error('Product graph not found. Run `cc ingest` first.'));
    }
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

export async function saveGraph(
  projectRoot: string,
  graph: ProductGraphInput,
): Promise<Result<void, Error>> {
  try {
    const validated = ProductGraphSchema.parse(graph);
    const path = productGraphPath(projectRoot);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(validated, null, 2), 'utf-8');
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

export function upsertNode(
  graph: ProductGraphInput,
  node: ProductGraphNodeInput,
): ProductGraphInput {
  const nodes = graph.nodes.filter((n) => n.id !== node.id);
  nodes.push(node);
  return { ...graph, nodes, updatedAt: new Date().toISOString() };
}

export function linkNodes(
  graph: ProductGraphInput,
  edge: ProductGraphEdgeInput,
): ProductGraphInput {
  const edges = graph.edges.filter(
    (e) => e.from !== edge.from || e.to !== edge.to || e.relation !== edge.relation,
  );
  edges.push(edge);
  return { ...graph, edges, updatedAt: new Date().toISOString() };
}

export function queryNodes(
  graph: ProductGraphInput,
  type?: ProductNodeType,
  textFilter?: string,
): ProductGraphNodeInput[] {
  let nodes = graph.nodes;
  if (type) {
    nodes = nodes.filter((n) => n.type === type);
  }
  if (textFilter) {
    const q = textFilter.toLowerCase();
    nodes = nodes.filter(
      (n) =>
        n.name.toLowerCase().includes(q) ||
        n.id.toLowerCase().includes(q) ||
        JSON.stringify(n.data).toLowerCase().includes(q),
    );
  }
  return nodes;
}

export function findPath(
  graph: ProductGraphInput,
  fromId: string,
  toId: string,
): string[] | null {
  if (fromId === toId) return [fromId];

  const adj = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const list = adj.get(edge.from) ?? [];
    list.push(edge.to);
    adj.set(edge.from, list);
    const rev = adj.get(edge.to) ?? [];
    rev.push(edge.from);
    adj.set(edge.to, rev);
  }

  const queue: string[] = [fromId];
  const visited = new Set<string>([fromId]);
  const parent = new Map<string, string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of adj.get(current) ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      parent.set(next, current);
      if (next === toId) {
        const path: string[] = [toId];
        let node = toId;
        while (parent.has(node)) {
          node = parent.get(node)!;
          path.unshift(node);
        }
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

export function countByType(graph: ProductGraphInput): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const node of graph.nodes) {
    counts[node.type] = (counts[node.type] ?? 0) + 1;
  }
  return counts;
}

export function getNeighbors(
  graph: ProductGraphInput,
  nodeId: string,
  relation?: ProductGraphEdgeInput['relation'],
): ProductGraphNodeInput[] {
  const neighborIds = new Set<string>();
  for (const edge of graph.edges) {
    if (relation && edge.relation !== relation) continue;
    if (edge.from === nodeId) neighborIds.add(edge.to);
    if (edge.to === nodeId) neighborIds.add(edge.from);
  }
  return graph.nodes.filter((n) => neighborIds.has(n.id));
}
