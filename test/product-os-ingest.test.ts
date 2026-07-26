import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runIngest } from '../src/core/knowledge/ingest-pipeline';
import { loadGraph, queryNodes } from '../src/core/product-graph/graph-store';
import { writeFile, mkdir } from 'node:fs/promises';

describe('Product OS ingest', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'cc-product-'));
    await mkdir(join(projectRoot, 'docs', 'adr'), { recursive: true });
    await mkdir(join(projectRoot, 'src', 'core'), { recursive: true });

    await writeFile(
      join(projectRoot, 'README.md'),
      '# Test Project\n\nA sample project for product OS ingest.\n',
      'utf-8',
    );

    await writeFile(
      join(projectRoot, 'docs', 'adr', 'adr-001-test.md'),
      `# ADR-001: Test Decision

**Status:** accepted

## Context

We need a test ADR.

## Decision

Use file-based product graph.

## Consequences

- Easier testing
`,
      'utf-8',
    );
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  test('runIngest builds product graph from README and ADR', async () => {
    const result = await runIngest(projectRoot, 'TestProject');
    expect(result.nodes).toBeGreaterThan(0);
    expect(result.sources).toContain('README.md');
    expect(result.sources).toContain('docs/adr');

    const graph = await loadGraph(projectRoot);
    expect(graph.success).toBe(true);
    if (!graph.success) return;

    const decisions = queryNodes(graph.data, 'decision');
    expect(decisions.length).toBeGreaterThan(0);

    const product = queryNodes(graph.data, 'product');
    expect(product.length).toBe(1);
  });
});
