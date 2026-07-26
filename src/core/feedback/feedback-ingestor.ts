import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { StrategicMemoryInput } from '../../validation/schemas';
import { listOutcomes } from '../evaluation/outcome-store';
import { loadGraph, upsertNode, saveGraph } from '../product-graph/graph-store';
import { loadStrategicMemory, saveStrategicMemory } from '../memory/strategic-memory';
import { appendEvent } from '../memory/episodic-store';
import { entityId, slugify } from '../knowledge/entity-normalizer';

export interface ProductInsight {
  type: string;
  message: string;
  confidence: 'low' | 'medium' | 'high';
}

export async function parseChangelogLearnings(projectRoot: string): Promise<string[]> {
  try {
    const content = await readFile(join(projectRoot, 'CHANGELOG.md'), 'utf-8');
    const unreleased = content.match(/## \[Unreleased\]([\s\S]*?)(?=## \[|\n## )/i);
    if (!unreleased) return [];
    return unreleased[1]!
      .split('\n')
      .filter((l) => l.trim().startsWith('-'))
      .map((l) => l.replace(/^-\s*/, '').trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function generateInsights(projectRoot: string): Promise<ProductInsight[]> {
  const insights: ProductInsight[] = [];

  const outcomes = await listOutcomes(projectRoot);
  if (outcomes.success) {
    const passed = outcomes.data.filter((o) => o.verdict === 'PASS' || o.status === 'pass');
    const failed = outcomes.data.filter((o) => o.verdict === 'REJECT' || o.status === 'phase_failed');
    insights.push({
      type: 'evaluation',
      message: `${passed.length} outcomes PASS, ${failed.length} failed/rejected`,
      confidence: 'high',
    });

    const byTask = new Map<string, number>();
    for (const o of passed) {
      byTask.set(o.taskId, (byTask.get(o.taskId) ?? 0) + 1);
    }
    for (const [taskId, count] of byTask) {
      if (count >= 2) {
        insights.push({
          type: 'feature_stability',
          message: `Task ${taskId}: ${count} successful outcomes`,
          confidence: 'medium',
        });
      }
    }
  }

  const learnings = await parseChangelogLearnings(projectRoot);
  for (const learning of learnings.slice(0, 5)) {
    insights.push({
      type: 'changelog',
      message: learning.slice(0, 120),
      confidence: 'medium',
    });
  }

  const graphResult = await loadGraph(projectRoot);
  if (graphResult.success) {
    const risks = graphResult.data.nodes.filter((n) => n.type === 'risk');
    if (risks.length) {
      insights.push({
        type: 'risk',
        message: `${risks.length} open technical risks in product graph`,
        confidence: 'high',
      });
    }

    const reqs = graphResult.data.nodes.filter((n) => n.type === 'requirement');
    const doneReqs = reqs.filter((n) => (n.data as { status?: string }).status === 'DONE');
    insights.push({
      type: 'backlog',
      message: `${doneReqs.length}/${reqs.length} requirements marked DONE in graph`,
      confidence: 'high',
    });
  }

  return insights;
}

export async function applyFeedbackToGraph(
  projectRoot: string,
  insights: ProductInsight[],
): Promise<void> {
  const graphResult = await loadGraph(projectRoot);
  if (!graphResult.success) return;

  let graph = graphResult.data;
  for (const insight of insights) {
    if (insight.type === 'risk') {
      graph = upsertNode(graph, {
        id: entityId('metric', slugify(insight.message)),
        type: 'metric',
        name: insight.message,
        data: { source: 'feedback' },
        confidence: insight.confidence,
      });
    }
  }
  await saveGraph(projectRoot, graph);

  const strategic = await loadStrategicMemory(projectRoot);
  if (strategic.success) {
    const mem: StrategicMemoryInput = {
      ...strategic.data,
      tradeoffs: [...strategic.data.tradeoffs, ...insights.slice(0, 3).map((i) => i.message)].slice(-20),
    };
    await saveStrategicMemory(projectRoot, mem);
  }

  await appendEvent(projectRoot, {
    type: 'feedback.processed',
    timestamp: new Date().toISOString(),
    payload: { insightCount: insights.length },
  });
}

export async function runFeedbackLoop(projectRoot: string): Promise<ProductInsight[]> {
  const insights = await generateInsights(projectRoot);
  await applyFeedbackToGraph(projectRoot, insights);
  return insights;
}
