import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  StrategicMemorySchema,
  type StrategicMemoryInput,
} from '../../validation/schemas';
import { err, ok, type Result } from '../../utils/result';
import { strategicPath } from '../product-graph/paths';

export async function loadStrategicMemory(
  projectRoot: string,
): Promise<Result<StrategicMemoryInput, Error>> {
  try {
    const raw = await readFile(strategicPath(projectRoot), 'utf-8');
    return ok(StrategicMemorySchema.parse(JSON.parse(raw)));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return ok({
        version: 1,
        kpis: [],
        tradeoffs: [],
        updatedAt: new Date().toISOString(),
      });
    }
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

export async function saveStrategicMemory(
  projectRoot: string,
  memory: StrategicMemoryInput,
): Promise<Result<void, Error>> {
  try {
    const validated = StrategicMemorySchema.parse({
      ...memory,
      updatedAt: new Date().toISOString(),
    });
    const path = strategicPath(projectRoot);
    await mkdir(resolve(projectRoot, '.codeconductor'), { recursive: true });
    await writeFile(path, JSON.stringify(validated, null, 2), 'utf-8');
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}
