import { analyzeImpactByFiles, analyzeImpactByNode } from '../core/impact/impact-engine';
import { loadGraph } from '../core/product-graph/graph-store';
import type { OutputMode } from '../utils/logger';

export interface ImpactOptions {
  readonly projectRoot: string;
  readonly output: OutputMode;
  readonly files?: string[];
  readonly node?: string;
  readonly capability?: string;
}

export async function impactCommand(
  options: ImpactOptions,
): Promise<{ code: number; data?: unknown }> {
  const { projectRoot, output, files, node, capability } = options;

  const graph = await loadGraph(projectRoot);
  if (!graph.success) {
    return {
      code: 1,
      data: { success: false, command: 'impact', errors: [graph.error.message] },
    };
  }

  let report;
  if (node) {
    report = analyzeImpactByNode(graph.data, node);
  } else if (capability) {
    const cap = graph.data.nodes.find(
      (n) => n.type === 'capability' && n.name.toLowerCase().includes(capability.toLowerCase()),
    );
    if (!cap) {
      return {
        code: 1,
        data: { success: false, command: 'impact', errors: [`Capability not found: ${capability}`] },
      };
    }
    report = analyzeImpactByNode(graph.data, cap.id);
  } else if (files && files.length > 0) {
    report = analyzeImpactByFiles(graph.data, files);
  } else {
    return {
      code: 1,
      data: {
        success: false,
        command: 'impact',
        errors: ['Provide --files, --node, or --capability'],
      },
    };
  }

  if (output === 'json') {
    return { code: 0, data: { success: true, command: 'impact', report } };
  }

  const lines = [
    `Target: ${report.target}`,
    report.summary,
    '',
    `Components: ${report.affectedComponents?.join(', ') || 'none'}`,
    `Contracts: ${report.brokenContracts?.join(', ') || 'none'}`,
    `Tests: ${report.affectedTests?.join(', ') || 'none'}`,
    `Flows: ${report.affectedFlows?.join(', ') || 'none'}`,
  ];

  return {
    code: 0,
    data: { success: true, command: 'impact', output: lines.join('\n') },
  };
}
