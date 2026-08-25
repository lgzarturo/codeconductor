import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadBacklog } from '../openspec/backlog-parser';
import type {
  KnowledgeEntityInput,
  ProductGraphInput,
  ProductMetaInput,
} from '../../validation/schemas';
import { entityId, normalizeEntities, slugify } from './entity-normalizer';
import {
  adrToEntities,
  parseAdrFile,
  parseGraphifyEntities,
  parseReadmeEntities,
  scanSrcComponents,
} from './source-parsers';
import { linkNodes, upsertNode } from '../product-graph/graph-store';
import { appendEvent } from '../memory/episodic-store';
import { mkdir, writeFile } from 'node:fs/promises';
import { productMetaPath } from '../product-graph/paths';
import { ProductMetaSchema } from '../../validation/schemas';

const DEFER_REGEX_SOURCE = String.raw`\/\/\s*defer\s*[-:]\s*(.+?)(?:\s*--(\w+))?\s*$`;
const WALK_READ_CONCURRENCY = 8;

async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      out[index] = await fn(items[index]!, index);
    }
  }
  const workers = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return out;
}

export interface IngestResult {
  entitiesAdded: number;
  nodes: number;
  edges: number;
  sources: string[];
}

async function hashFile(path: string): Promise<string | null> {
  try {
    const content = await readFile(path, 'utf-8');
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
  } catch {
    return null;
  }
}

async function collectDeferRisks(projectRoot: string): Promise<KnowledgeEntityInput[]> {
  const { readdir } = await import('node:fs/promises');
  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else if (entry.name.endsWith('.ts')) {
          files.push(full);
        }
      }
    } catch {
      // skip
    }
  }

  await walk(join(projectRoot, 'src'));

  const perFile = await mapLimit(files, WALK_READ_CONCURRENCY, async (full) => {
    const entities: KnowledgeEntityInput[] = [];
    const content = await readFile(full, 'utf-8');
    const rel = full.replace(projectRoot + '/', '');
    const deferRe = new RegExp(DEFER_REGEX_SOURCE, 'gm');
    let match: RegExpExecArray | null;
    while ((match = deferRe.exec(content)) !== null) {
      const reason = match[1]!.trim();
      const slug = slugify(`${rel}-${reason}`).slice(0, 48);
      entities.push({
        type: 'risk',
        id: entityId('risk', slug),
        name: reason,
        source: rel,
        confidence: 'high',
        relations: [],
        data: { file: rel, tag: match[2] },
      });
    }
    return entities;
  });

  return perFile.flat();
}

async function parseBacklogEntities(projectRoot: string): Promise<KnowledgeEntityInput[]> {
  const result = await loadBacklog(projectRoot);
  if (!result.success) return [];

  const doc = result.data;
  const entities: KnowledgeEntityInput[] = [];

  entities.push({
    type: 'domain',
    id: entityId('domain', slugify(doc.global.product)),
    name: doc.global.product,
    source: 'BACKLOG.md',
    confidence: 'high',
    relations: [],
    data: { strategy: doc.global.strategy, policy: doc.global.policy },
  });

  for (const item of doc.items) {
    entities.push({
      type: 'requirement',
      id: entityId('requirement', item.id.toLowerCase()),
      name: item.title,
      source: 'BACKLOG.md',
      confidence: 'high',
      relations: item.dependencies.map((dep) => ({
        targetId: entityId('requirement', dep.toLowerCase()),
        relation: 'depends_on' as const,
      })),
      data: {
        priority: item.priority,
        status: item.status,
        type: item.type,
        acceptanceCriteria: item.acceptanceCriteria,
        scope: item.scope,
      },
    });
  }

  return entities;
}

async function parseAdrEntities(projectRoot: string): Promise<KnowledgeEntityInput[]> {
  const { readdir } = await import('node:fs/promises');
  const adrDir = join(projectRoot, 'docs', 'adr');
  const entities: KnowledgeEntityInput[] = [];
  try {
    const files = (await readdir(adrDir)).filter((file) => file.endsWith('.md'));
    const parsed = await Promise.all(
      files.map(async (file) => {
        const adr = await parseAdrFile(join(adrDir, file));
        return adr ? adrToEntities(adr, `docs/adr/${file}`) : [];
      }),
    );
    entities.push(...parsed.flat());
  } catch {
    // no adr dir
  }
  return entities;
}

export function buildGraphFromEntities(
  entities: KnowledgeEntityInput[],
  productName: string,
): ProductGraphInput {
  const productId = entityId('product', slugify(productName));
  const graph: ProductGraphInput = {
    version: 1,
    productId,
    productName,
    nodes: [],
    edges: [],
    updatedAt: new Date().toISOString(),
  };

  let g = upsertNode(graph, {
    id: productId,
    type: 'product',
    name: productName,
    data: {},
    confidence: 'high',
  });

  for (const entity of entities) {
    g = upsertNode(g, {
      id: entity.id,
      type: entity.type,
      name: entity.name,
      data: entity.data ?? {},
      source: entity.source,
      confidence: entity.confidence,
      version: entity.version,
    });

    if (entity.type !== 'product') {
      g = linkNodes(g, {
        from: productId,
        to: entity.id,
        relation: 'contains',
      });
    }

    for (const rel of entity.relations) {
      g = linkNodes(g, {
        from: entity.id,
        to: rel.targetId,
        relation: rel.relation,
      });
    }
  }

  return g;
}

export async function runIngest(projectRoot: string, productName: string): Promise<IngestResult> {
  const sources: string[] = [];
  const allEntities: KnowledgeEntityInput[] = [];

  const [readme, backlog, adrs, graphify, components, risks] = await Promise.all([
    parseReadmeEntities(projectRoot, productName),
    parseBacklogEntities(projectRoot),
    parseAdrEntities(projectRoot),
    parseGraphifyEntities(projectRoot),
    scanSrcComponents(projectRoot),
    collectDeferRisks(projectRoot),
  ]);

  if (readme.length) {
    sources.push('README.md');
    allEntities.push(...readme);
  }

  if (backlog.length) {
    sources.push('BACKLOG.md');
    allEntities.push(...backlog);
  }

  if (adrs.length) {
    sources.push('docs/adr');
    allEntities.push(...adrs);
  }

  if (graphify.length) {
    sources.push('graphify-out/graph.json');
    allEntities.push(...graphify);
  }

  if (components.length) {
    sources.push('src/');
    allEntities.push(...components);
  }

  if (risks.length) {
    sources.push('src/ (defer)');
    allEntities.push(...risks);
  }

  const normalized = normalizeEntities(allEntities);
  const graph = buildGraphFromEntities(normalized, productName);

  const { saveGraph } = await import('../product-graph/graph-store');
  await saveGraph(projectRoot, graph);

  const sourceHashes: Record<string, string> = {};
  for (const src of ['README.md', 'BACKLOG.md', 'ROADMAP.md']) {
    const h = await hashFile(join(projectRoot, src));
    if (h) sourceHashes[src] = h;
  }

  const meta: ProductMetaInput = {
    version: 1,
    graphVersion: new Date().toISOString(),
    lastIngestAt: new Date().toISOString(),
    sourceHashes,
  };
  await mkdir(join(projectRoot, '.codeconductor'), { recursive: true });
  await writeFile(
    productMetaPath(projectRoot),
    JSON.stringify(ProductMetaSchema.parse(meta), null, 2),
    'utf-8',
  );

  await appendEvent(projectRoot, {
    type: 'ingest.completed',
    timestamp: new Date().toISOString(),
    payload: { sources, nodeCount: graph.nodes.length, edgeCount: graph.edges.length },
  });

  return {
    entitiesAdded: normalized.length,
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    sources,
  };
}
