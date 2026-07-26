import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ProductEventSchema, type ProductEventInput } from '../../validation/schemas';
import { err, ok, type Result } from '../../utils/result';
import { eventsPath } from '../product-graph/paths';

export async function appendEvent(
  projectRoot: string,
  event: Omit<ProductEventInput, 'id'> & { id?: string },
): Promise<Result<ProductEventInput, Error>> {
  try {
    const full: ProductEventInput = ProductEventSchema.parse({
      ...event,
      id: event.id ?? `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    });
    const path = eventsPath(projectRoot);
    await mkdir(resolve(projectRoot, '.codeconductor'), { recursive: true });
    await appendFile(path, JSON.stringify(full) + '\n', 'utf-8');
    return ok(full);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

export async function listEvents(
  projectRoot: string,
  since?: string,
  type?: ProductEventInput['type'],
): Promise<Result<ProductEventInput[], Error>> {
  try {
    const content = await readFile(eventsPath(projectRoot), 'utf-8');
    const events: ProductEventInput[] = [];
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      const parsed = ProductEventSchema.parse(JSON.parse(line));
      if (since && parsed.timestamp < since) continue;
      if (type && parsed.type !== type) continue;
      events.push(parsed);
    }
    return ok(events);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return ok([]);
    }
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}
