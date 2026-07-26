import { loadConfig } from '../core/config/config-loader';
import { runIngest } from '../core/knowledge/ingest-pipeline';
import type { OutputMode } from '../utils/logger';

export interface IngestOptions {
  readonly projectRoot: string;
  readonly output: OutputMode;
}

export async function ingestCommand(
  options: IngestOptions,
): Promise<{ code: number; data?: unknown }> {
  const { projectRoot, output } = options;

  try {
    let productName = 'project';
    const config = await loadConfig(projectRoot);
    if (config.success) {
      productName = config.data.project.name;
    }

    const result = await runIngest(projectRoot, productName);

    if (output === 'json') {
      return {
        code: 0,
        data: {
          success: true,
          command: 'ingest',
          ...result,
        },
      };
    }

    const lines = [
      'Product knowledge ingested.',
      `Sources: ${result.sources.join(', ') || 'none'}`,
      `Entities: ${result.entitiesAdded}`,
      `Graph nodes: ${result.nodes}, edges: ${result.edges}`,
      'File: .codeconductor/product-graph.json',
    ];

    return {
      code: 0,
      data: {
        success: true,
        command: 'ingest',
        output: lines.join('\n'),
      },
    };
  } catch (e) {
    return {
      code: 1,
      data: {
        success: false,
        command: 'ingest',
        errors: [e instanceof Error ? e.message : String(e)],
      },
    };
  }
}
