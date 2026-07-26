import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  OperationalStateSchema,
  type OperationalStateInput,
} from '../../validation/schemas';
import { err, ok, type Result } from '../../utils/result';
import { operationalStatePath } from '../product-graph/paths';

export async function loadOperationalState(
  projectRoot: string,
): Promise<Result<OperationalStateInput, Error>> {
  try {
    const raw = await readFile(operationalStatePath(projectRoot), 'utf-8');
    return ok(OperationalStateSchema.parse(JSON.parse(raw)));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return ok({
        version: 1,
        activeAgents: [],
        activeTaskIds: [],
        blockers: [],
        updatedAt: new Date().toISOString(),
      });
    }
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

export async function saveOperationalState(
  projectRoot: string,
  state: OperationalStateInput,
): Promise<Result<void, Error>> {
  try {
    const validated = OperationalStateSchema.parse({
      ...state,
      updatedAt: new Date().toISOString(),
    });
    const path = operationalStatePath(projectRoot);
    await mkdir(resolve(projectRoot, '.codeconductor'), { recursive: true });
    await writeFile(path, JSON.stringify(validated, null, 2), 'utf-8');
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

export async function setActiveTask(
  projectRoot: string,
  taskId: string,
  agent?: string,
): Promise<Result<void, Error>> {
  const load = await loadOperationalState(projectRoot);
  if (!load.success) return load;
  const state = load.data;
  if (!state.activeTaskIds.includes(taskId)) {
    state.activeTaskIds.push(taskId);
  }
  if (agent && !state.activeAgents.includes(agent)) {
    state.activeAgents.push(agent);
  }
  return saveOperationalState(projectRoot, state);
}

export async function clearActiveTask(
  projectRoot: string,
  taskId: string,
): Promise<Result<void, Error>> {
  const load = await loadOperationalState(projectRoot);
  if (!load.success) return load;
  const state = load.data;
  state.activeTaskIds = state.activeTaskIds.filter((id) => id !== taskId);
  state.blockers = state.blockers.filter((b) => b.taskId !== taskId);
  return saveOperationalState(projectRoot, state);
}
