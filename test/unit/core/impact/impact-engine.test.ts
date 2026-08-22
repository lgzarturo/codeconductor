import { describe, expect, test } from 'bun:test';
import { analyzeImpactByFiles, analyzeImpactByNode } from '../../../../src/core/impact/impact-engine';
import type { ProductGraphInput } from '../../../../src/validation/schemas';

/**
 * Contract tests for impact-engine output schema.
 *
 * These tests verify that the analyzeImpactByFiles and analyzeImpactByNode
 * functions return objects with the contract fields: affectedComponents,
 * brokenContracts, and affectedFlows. These fields are referenced in
 * .claude/commands/cc/refactor.md and must remain stable.
 *
 * If any of these tests fail, it indicates a breaking change to the
 * impact report schema that would break documented workflows.
 */

const baseGraph = (): ProductGraphInput => ({
  version: 1,
  productId: 'test-product',
  productName: 'Test Product',
  nodes: [
    { id: 'comp-1', type: 'component', name: 'Component A', data: { path: 'src/a.ts' } },
    { id: 'comp-2', type: 'component', name: 'Component B', data: { path: 'src/b.ts' } },
    { id: 'contract-1', type: 'contract', name: 'Contract X', data: {} },
    { id: 'flow-1', type: 'flow', name: 'Flow Alpha', data: {} },
    { id: 'test-1', type: 'component', name: 'test-suite', data: { path: 'test/a.test.ts' } },
  ],
  edges: [
    { from: 'comp-1', to: 'contract-1', relation: 'implements' },
    { from: 'comp-1', to: 'flow-1', relation: 'participates_in' },
    { from: 'comp-1', to: 'test-1', relation: 'tested_by' },
    { from: 'comp-2', to: 'comp-1', relation: 'depends_on' },
  ],
  updatedAt: '2026-08-21T00:00:00Z',
});

describe('core/impact/impact-engine — contract tests', () => {
  describe('analyzeImpactByFiles', () => {
    test('returns object with affectedComponents field (array of strings)', () => {
      const graph = baseGraph();
      const report = analyzeImpactByFiles(graph, ['src/a.ts']);

      expect(report).toHaveProperty('affectedComponents');
      expect(Array.isArray(report.affectedComponents)).toBe(true);
      expect(report.affectedComponents.every((x) => typeof x === 'string')).toBe(true);
    });

    test('returns object with brokenContracts field (array of strings)', () => {
      const graph = baseGraph();
      const report = analyzeImpactByFiles(graph, ['src/a.ts']);

      expect(report).toHaveProperty('brokenContracts');
      expect(Array.isArray(report.brokenContracts)).toBe(true);
      expect(report.brokenContracts.every((x) => typeof x === 'string')).toBe(true);
    });

    test('returns object with affectedFlows field (array of strings)', () => {
      const graph = baseGraph();
      const report = analyzeImpactByFiles(graph, ['src/a.ts']);

      expect(report).toHaveProperty('affectedFlows');
      expect(Array.isArray(report.affectedFlows)).toBe(true);
      expect(report.affectedFlows.every((x) => typeof x === 'string')).toBe(true);
    });

    test('populates affectedComponents when files match component paths', () => {
      const graph = baseGraph();
      const report = analyzeImpactByFiles(graph, ['src/a.ts']);

      expect(report.affectedComponents.length).toBeGreaterThan(0);
      expect(report.affectedComponents).toContain('Component A');
    });

    test('populates brokenContracts when affected components implement contracts', () => {
      const graph = baseGraph();
      const report = analyzeImpactByFiles(graph, ['src/a.ts']);

      expect(report.brokenContracts.length).toBeGreaterThan(0);
      expect(report.brokenContracts).toContain('Contract X');
    });

    test('populates affectedFlows when affected components participate in flows', () => {
      const graph = baseGraph();
      const report = analyzeImpactByFiles(graph, ['src/a.ts']);

      expect(report.affectedFlows.length).toBeGreaterThan(0);
      expect(report.affectedFlows).toContain('Flow Alpha');
    });

    test('returns empty arrays when file does not match any components', () => {
      const graph = baseGraph();
      const report = analyzeImpactByFiles(graph, ['src/nonexistent.ts']);

      expect(report.affectedComponents).toHaveLength(0);
      expect(report.brokenContracts).toHaveLength(0);
      expect(report.affectedFlows).toHaveLength(0);
    });
  });

  describe('analyzeImpactByNode', () => {
    test('returns object with affectedComponents field (array of strings)', () => {
      const graph = baseGraph();
      const report = analyzeImpactByNode(graph, 'comp-1');

      expect(report).toHaveProperty('affectedComponents');
      expect(Array.isArray(report.affectedComponents)).toBe(true);
      expect(report.affectedComponents.every((x) => typeof x === 'string')).toBe(true);
    });

    test('returns object with brokenContracts field (array of strings)', () => {
      const graph = baseGraph();
      const report = analyzeImpactByNode(graph, 'comp-1');

      expect(report).toHaveProperty('brokenContracts');
      expect(Array.isArray(report.brokenContracts)).toBe(true);
      expect(report.brokenContracts.every((x) => typeof x === 'string')).toBe(true);
    });

    test('returns object with affectedFlows field (array of strings)', () => {
      const graph = baseGraph();
      const report = analyzeImpactByNode(graph, 'comp-1');

      expect(report).toHaveProperty('affectedFlows');
      expect(Array.isArray(report.affectedFlows)).toBe(true);
      expect(report.affectedFlows.every((x) => typeof x === 'string')).toBe(true);
    });

    test('populates fields from neighbor relationships', () => {
      const graph = baseGraph();
      const report = analyzeImpactByNode(graph, 'comp-1');

      // comp-1 connects to contract-1, flow-1, and test-1 via edges
      expect(report.brokenContracts).toContain('Contract X');
      expect(report.affectedFlows).toContain('Flow Alpha');
    });

    test('handles non-existent node gracefully', () => {
      const graph = baseGraph();
      const report = analyzeImpactByNode(graph, 'nonexistent-id');

      expect(report).toHaveProperty('affectedComponents');
      expect(report).toHaveProperty('brokenContracts');
      expect(report).toHaveProperty('affectedFlows');
      expect(report.affectedComponents).toHaveLength(0);
      expect(report.brokenContracts).toHaveLength(0);
      expect(report.affectedFlows).toHaveLength(0);
    });
  });

  describe('Output schema stability', () => {
    test('both functions return objects with all required contract fields', () => {
      const graph = baseGraph();

      const reportByFiles = analyzeImpactByFiles(graph, ['src/a.ts']);
      const reportByNode = analyzeImpactByNode(graph, 'comp-1');

      const requiredFields = ['target', 'affectedComponents', 'brokenContracts', 'affectedFlows', 'summary'];

      for (const field of requiredFields) {
        expect(reportByFiles).toHaveProperty(field);
        expect(reportByNode).toHaveProperty(field);
      }
    });
  });
});
