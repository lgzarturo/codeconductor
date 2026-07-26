import type { ImpactReportInput, ProductGraphInput } from '../../validation/schemas';
import { getNeighbors, queryNodes } from '../product-graph/graph-store';

export function analyzeImpactByFiles(
  graph: ProductGraphInput,
  files: string[],
): ImpactReportInput {
  const affectedComponents: string[] = [];
  const affectedTests: string[] = [];
  const affectedFlows: string[] = [];
  const brokenContracts: string[] = [];
  const brokenEndpoints: string[] = [];

  for (const file of files) {
    const normalized = file.replace(/^\.\//, '');
    const components = queryNodes(graph).filter((n) => {
      const path = (n.data as { path?: string }).path;
      return path && normalized.includes(path) || path?.includes(normalized);
    });

    for (const comp of components) {
      affectedComponents.push(comp.name);
      const neighbors = getNeighbors(graph, comp.id);
      for (const neighbor of neighbors) {
        if (neighbor.type === 'contract') brokenContracts.push(neighbor.name);
        if (neighbor.type === 'flow') affectedFlows.push(neighbor.name);
        if (neighbor.type === 'component' && neighbor.name.includes('test')) {
          affectedTests.push(neighbor.name);
        }
        const endpoint = (neighbor.data as { endpoint?: string }).endpoint;
        if (endpoint) brokenEndpoints.push(endpoint);
      }
    }
  }

  const unique = <T>(arr: T[]): T[] => [...new Set(arr)];

  return {
    target: files.join(', '),
    affectedComponents: unique(affectedComponents),
    affectedTests: unique(affectedTests),
    affectedFlows: unique(affectedFlows),
    brokenContracts: unique(brokenContracts),
    brokenEndpoints: unique(brokenEndpoints),
    summary: buildImpactSummary(unique(affectedComponents), unique(brokenContracts), unique(affectedTests)),
  };
}

export function analyzeImpactByNode(
  graph: ProductGraphInput,
  nodeId: string,
): ImpactReportInput {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) {
    return {
      target: nodeId,
      brokenEndpoints: [],
      brokenContracts: [],
      affectedTests: [],
      affectedFlows: [],
      affectedComponents: [],
      summary: `Node ${nodeId} not found in product graph`,
    };
  }

  const neighbors = getNeighbors(graph, nodeId);
  const components = neighbors.filter((n) => n.type === 'component').map((n) => n.name);
  const contracts = neighbors.filter((n) => n.type === 'contract').map((n) => n.name);
  const flows = neighbors.filter((n) => n.type === 'flow').map((n) => n.name);
  const tests = neighbors
    .filter((n) => n.name.toLowerCase().includes('test') || (n.data as { path?: string }).path?.includes('test'))
    .map((n) => n.name);

  return {
    target: nodeId,
    affectedComponents: components,
    brokenContracts: contracts,
    affectedFlows: flows,
    affectedTests: tests,
    brokenEndpoints: [],
    summary: buildImpactSummary(components, contracts, tests),
  };
}

function buildImpactSummary(
  components: string[],
  contracts: string[],
  tests: string[],
): string {
  const parts: string[] = [];
  if (components.length) parts.push(`${components.length} component(s)`);
  if (contracts.length) parts.push(`${contracts.length} contract(s)`);
  if (tests.length) parts.push(`${tests.length} test(s)`);
  if (!parts.length) return 'No linked impact detected in product graph';
  return `If you change this, you may affect: ${parts.join(', ')}`;
}
