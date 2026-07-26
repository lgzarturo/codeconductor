import { writeFile } from 'node:fs/promises';
import {
  countByType,
  findPath,
  loadGraph,
  queryNodes,
} from '../core/product-graph/graph-store';
import { productReportPath } from '../core/product-graph/paths';
import { listEvents } from '../core/memory/episodic-store';
import { loadOperationalState } from '../core/memory/operational-state';
import { loadStrategicMemory } from '../core/memory/strategic-memory';
import { loadMemoryIndex } from '../core/memory/memory-index';
import { generateInsights, runFeedbackLoop } from '../core/feedback/feedback-ingestor';
import type { OutputMode } from '../utils/logger';

export interface ProductOptions {
  readonly subcommand: string;
  readonly projectRoot: string;
  readonly output: OutputMode;
  readonly query?: string;
  readonly from?: string;
  readonly to?: string;
  readonly since?: string;
  readonly format?: string;
}

export async function productCommand(
  options: ProductOptions,
): Promise<{ code: number; data?: unknown }> {
  const { subcommand, projectRoot, output, query, from, to, since, format } = options;

  try {
    switch (subcommand) {
      case 'graph':
        return await handleGraph(projectRoot, output);
      case 'query':
        return await handleQuery(projectRoot, query ?? '', output);
      case 'path':
        return await handlePath(projectRoot, from ?? '', to ?? '', output);
      case 'timeline':
        return await handleTimeline(projectRoot, output, since);
      case 'memory':
        return await handleMemory(projectRoot, output);
      case 'decisions':
        return await handleDecisions(projectRoot, output);
      case 'insights':
        return await handleInsights(projectRoot, output);
      case 'export':
        return await handleExport(projectRoot, format ?? 'markdown', output);
      default:
        return {
          code: 1,
          data: {
            success: false,
            command: 'product',
            errors: [
              'Usage: product graph|query|path|timeline|memory|decisions|insights|export',
            ],
          },
        };
    }
  } catch (e) {
    return {
      code: 1,
      data: {
        success: false,
        command: 'product',
        errors: [e instanceof Error ? e.message : String(e)],
      },
    };
  }
}

async function handleGraph(
  projectRoot: string,
  output: OutputMode,
): Promise<{ code: number; data?: unknown }> {
  const graph = await loadGraph(projectRoot);
  if (!graph.success) {
    return { code: 1, data: { success: false, command: 'product', errors: [graph.error.message] } };
  }
  const counts = countByType(graph.data);
  const data = {
    productName: graph.data.productName,
    nodeCount: graph.data.nodes.length,
    edgeCount: graph.data.edges.length,
    counts,
    updatedAt: graph.data.updatedAt,
  };
  if (output === 'json') {
    return { code: 0, data: { success: true, command: 'product graph', ...data } };
  }
  const lines = [
    `Product: ${data.productName}`,
    `Nodes: ${data.nodeCount}, Edges: ${data.edgeCount}`,
    `Updated: ${data.updatedAt}`,
    '',
    'By type:',
    ...Object.entries(counts).map(([t, n]) => `  ${t}: ${n}`),
  ];
  return { code: 0, data: { success: true, command: 'product graph', output: lines.join('\n') } };
}

async function handleQuery(
  projectRoot: string,
  queryText: string,
  output: OutputMode,
): Promise<{ code: number; data?: unknown }> {
  const graph = await loadGraph(projectRoot);
  if (!graph.success) {
    return { code: 1, data: { success: false, command: 'product', errors: [graph.error.message] } };
  }
  const typeMatch = queryText.match(/^(product|domain|capability|requirement|decision|component|flow|contract|metric|risk|task|evidence):?(.*)$/i);
  const type = typeMatch?.[1]?.toLowerCase() as import('../domain/product/entities').ProductNodeType | undefined;
  const text = typeMatch?.[2]?.trim() || queryText;
  const nodes = queryNodes(graph.data, type, text || undefined);
  if (output === 'json') {
    return { code: 0, data: { success: true, command: 'product query', nodes } };
  }
  const lines = nodes.map((n) => `${n.id} — ${n.name} (${n.type})`);
  return {
    code: 0,
    data: { success: true, command: 'product query', output: lines.join('\n') || 'No matches' },
  };
}

async function handlePath(
  projectRoot: string,
  fromId: string,
  toId: string,
  output: OutputMode,
): Promise<{ code: number; data?: unknown }> {
  const graph = await loadGraph(projectRoot);
  if (!graph.success) {
    return { code: 1, data: { success: false, command: 'product', errors: [graph.error.message] } };
  }
  const path = findPath(graph.data, fromId, toId);
  if (output === 'json') {
    return { code: 0, data: { success: true, command: 'product path', path } };
  }
  return {
    code: 0,
    data: {
      success: true,
      command: 'product path',
      output: path ? path.join(' → ') : 'No path found',
    },
  };
}

async function handleTimeline(
  projectRoot: string,
  output: OutputMode,
  since?: string,
): Promise<{ code: number; data?: unknown }> {
  const events = await listEvents(projectRoot, since);
  if (!events.success) {
    return { code: 1, data: { success: false, command: 'product', errors: [events.error.message] } };
  }
  if (output === 'json') {
    return { code: 0, data: { success: true, command: 'product timeline', events: events.data } };
  }
  const lines = events.data.map((e) => `${e.timestamp} [${e.type}] ${JSON.stringify(e.payload)}`);
  return {
    code: 0,
    data: { success: true, command: 'product timeline', output: lines.join('\n') || 'No events' },
  };
}

async function handleMemory(
  projectRoot: string,
  output: OutputMode,
): Promise<{ code: number; data?: unknown }> {
  const op = await loadOperationalState(projectRoot);
  const strategic = await loadStrategicMemory(projectRoot);
  const memIdx = await loadMemoryIndex(projectRoot);
  const data = {
    operational: op.success ? op.data : null,
    strategic: strategic.success ? strategic.data : null,
    memoryPointers: memIdx.success ? memIdx.data.pointers.length : 0,
  };
  if (output === 'json') {
    return { code: 0, data: { success: true, command: 'product memory', ...data } };
  }
  const lines = [
    'Memory layers:',
    `  Operational: ${data.operational?.activeTaskIds.length ?? 0} active tasks`,
    `  Strategic KPIs: ${data.strategic?.kpis.length ?? 0}`,
    `  Memory pointers: ${data.memoryPointers}`,
  ];
  return { code: 0, data: { success: true, command: 'product memory', output: lines.join('\n') } };
}

async function handleDecisions(
  projectRoot: string,
  output: OutputMode,
): Promise<{ code: number; data?: unknown }> {
  const graph = await loadGraph(projectRoot);
  if (!graph.success) {
    return { code: 1, data: { success: false, command: 'product', errors: [graph.error.message] } };
  }
  const decisions = queryNodes(graph.data, 'decision');
  if (output === 'json') {
    return { code: 0, data: { success: true, command: 'product decisions', decisions } };
  }
  const lines = decisions.map((d) => `${d.id}: ${d.name}`);
  return {
    code: 0,
    data: { success: true, command: 'product decisions', output: lines.join('\n') || 'No decisions' },
  };
}

async function handleInsights(
  projectRoot: string,
  output: OutputMode,
): Promise<{ code: number; data?: unknown }> {
  const insights = await runFeedbackLoop(projectRoot);
  if (output === 'json') {
    return { code: 0, data: { success: true, command: 'product insights', insights } };
  }
  const lines = insights.map((i) => `[${i.type}] ${i.message}`);
  return {
    code: 0,
    data: { success: true, command: 'product insights', output: lines.join('\n') || 'No insights' },
  };
}

async function handleExport(
  projectRoot: string,
  format: string,
  output: OutputMode,
): Promise<{ code: number; data?: unknown }> {
  const graph = await loadGraph(projectRoot);
  if (!graph.success) {
    return { code: 1, data: { success: false, command: 'product', errors: [graph.error.message] } };
  }
  if (format === 'json') {
    if (output === 'json') {
      return { code: 0, data: { success: true, command: 'product export', graph: graph.data } };
    }
    return { code: 0, data: { success: true, command: 'product export', output: JSON.stringify(graph.data, null, 2) } };
  }

  const counts = countByType(graph.data);
  const md = [
    '# Product Report',
    '',
    `**Product:** ${graph.data.productName}`,
    `**Updated:** ${graph.data.updatedAt}`,
    '',
    '## Summary',
    ...Object.entries(counts).map(([t, n]) => `- ${t}: ${n}`),
    '',
    '## Domains',
    ...queryNodes(graph.data, 'domain').map((n) => `- ${n.name}`),
    '',
    '## Decisions',
    ...queryNodes(graph.data, 'decision').map((n) => `- ${n.name}`),
    '',
    '## Open Risks',
    ...queryNodes(graph.data, 'risk').map((n) => `- ${n.name}`),
  ].join('\n');

  await writeFile(productReportPath(projectRoot), md, 'utf-8');

  return {
    code: 0,
    data: {
      success: true,
      command: 'product export',
      output: output === 'json' ? { path: '.codeconductor/product-report.md' } : `Exported to .codeconductor/product-report.md`,
    },
  };
}
