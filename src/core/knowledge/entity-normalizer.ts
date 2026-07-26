import type { KnowledgeEntityInput } from '../../validation/schemas';

/**
 * Deduplicate entities by id + source, merge relations.
 */
export function normalizeEntities(entities: KnowledgeEntityInput[]): KnowledgeEntityInput[] {
  const map = new Map<string, KnowledgeEntityInput>();

  for (const entity of entities) {
    const key = `${entity.source}:${entity.id}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...entity, relations: [...entity.relations] });
      continue;
    }
    const relationKeys = new Set(
      existing.relations.map((r) => `${r.targetId}:${r.relation}`),
    );
    for (const rel of entity.relations) {
      const rk = `${rel.targetId}:${rel.relation}`;
      if (!relationKeys.has(rk)) {
        existing.relations.push(rel);
        relationKeys.add(rk);
      }
    }
    if (entity.confidence === 'high' && existing.confidence !== 'high') {
      existing.confidence = entity.confidence;
    }
    existing.data = { ...existing.data, ...entity.data };
  }

  return Array.from(map.values());
}

export function entityId(type: string, slug: string): string {
  return `${type}:${slug}`;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}
