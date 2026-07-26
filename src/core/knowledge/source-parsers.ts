import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { KnowledgeEntityInput } from '../../validation/schemas';
import { entityId, slugify } from './entity-normalizer';

export interface AdrParsed {
  id: string;
  title: string;
  status: string;
  context: string;
  decision: string;
  consequences: string[];
}

export async function parseAdrFile(filePath: string): Promise<AdrParsed | null> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const basename = filePath.split('/').pop() ?? '';
    const idMatch = basename.match(/adr-(\d+)/i);
    const id = idMatch ? `adr-${idMatch[1]}` : slugify(basename);

    const titleMatch = content.match(/^#\s+ADR-\d+:\s*(.+)$/m);
    const statusMatch = content.match(/\*\*Status:\*\*\s*(\w+)/i);
    const contextSection = extractSection(content, 'Context');
    const decisionSection = extractSection(content, 'Decision');
    const consequencesSection = extractSection(content, 'Consequences');

    const consequences = consequencesSection
      .split('\n')
      .filter((l) => l.trim().startsWith('-') || l.trim().startsWith('*'))
      .map((l) => l.replace(/^[\s*-]+/, '').trim())
      .filter(Boolean);

    return {
      id,
      title: titleMatch?.[1]?.trim() ?? basename,
      status: statusMatch?.[1]?.toLowerCase() ?? 'unknown',
      context: contextSection.trim(),
      decision: decisionSection.trim(),
      consequences,
    };
  } catch {
    return null;
  }
}

function extractSection(content: string, heading: string): string {
  const re = new RegExp(`##\\s+${heading}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, 'i');
  const match = content.match(re);
  return match?.[1] ?? '';
}

export function adrToEntities(adr: AdrParsed, source: string): KnowledgeEntityInput[] {
  const entities: KnowledgeEntityInput[] = [
    {
      type: 'decision',
      id: entityId('decision', adr.id),
      name: adr.title,
      source,
      confidence: 'high',
      relations: [],
      data: {
        context: adr.context,
        chosenOption: adr.decision,
        consequences: adr.consequences,
        status: adr.status,
      },
    },
  ];
  return entities;
}

export async function parseReadmeEntities(
  projectRoot: string,
  productName: string,
): Promise<KnowledgeEntityInput[]> {
  try {
    const content = await readFile(join(projectRoot, 'README.md'), 'utf-8');
    const firstPara = content
      .split('\n\n')
      .find((p) => p.trim() && !p.startsWith('#') && !p.startsWith('>')) ?? '';
    return [
      {
        type: 'product',
        id: entityId('product', slugify(productName)),
        name: productName,
        source: 'README.md',
        confidence: 'high',
        relations: [],
        data: { description: firstPara.slice(0, 500) },
      },
    ];
  } catch {
    return [];
  }
}

export async function parseGraphifyEntities(
  projectRoot: string,
): Promise<KnowledgeEntityInput[]> {
  try {
    const raw = await readFile(join(projectRoot, 'graphify-out', 'graph.json'), 'utf-8');
    const graph = JSON.parse(raw) as {
      nodes?: Array<{ id?: string; label?: string; type?: string; path?: string }>;
    };
    const entities: KnowledgeEntityInput[] = [];
    for (const node of graph.nodes ?? []) {
      const label = node.label ?? node.id ?? 'unknown';
      const slug = slugify(label);
      entities.push({
        type: 'component',
        id: entityId('component', slug),
        name: label,
        source: 'graphify-out/graph.json',
        confidence: 'medium',
        relations: [],
        data: { path: node.path, graphType: node.type },
      });
    }
    return entities;
  } catch {
    return [];
  }
}

export async function scanSrcComponents(projectRoot: string): Promise<KnowledgeEntityInput[]> {
  const { readdir } = await import('node:fs/promises');
  const entities: KnowledgeEntityInput[] = [];
  const srcDir = join(projectRoot, 'src');

  async function walk(dir: string, prefix: string): Promise<void> {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules') continue;
          const domainSlug = slugify(entry.name);
          entities.push({
            type: 'domain',
            id: entityId('domain', prefix ? `${prefix}-${domainSlug}` : domainSlug),
            name: entry.name,
            source: 'src/',
            confidence: 'medium',
            relations: [],
            data: { path: full.replace(projectRoot + '/', '') },
          });
          await walk(full, prefix ? `${prefix}-${domainSlug}` : domainSlug);
        }
      }
    } catch {
      // skip
    }
  }

  await walk(srcDir, '');
  return entities;
}
