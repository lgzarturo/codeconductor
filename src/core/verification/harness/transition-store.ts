import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { writeFileAtomic } from '../../openspec/openspec-state';
import type { HarnessState } from './types';

const STATE_FILE = 'state.json';

const HarnessTransitionStateSchema = z.object({
  version: z.literal(1),
  state: z.string(),
  attempts: z.number().int().nonnegative(),
  challengesUsed: z.number().int().nonnegative(),
  redVerified: z.boolean(),
  sealHash: z.string(),
  sealedPaths: z.array(z.string()),
  assertionBaseline: z.record(z.string(), z.number().int().nonnegative()),
  updatedAt: z.string(),
  transitions: z.array(z.object({
    from: z.string(),
    to: z.string(),
    at: z.string(),
  })).default([]),
});

export type HarnessTransitionState = z.infer<typeof HarnessTransitionStateSchema>;

export function harnessStatePath(worktreeRoot: string, lockDir = '.harness'): string {
  return join(worktreeRoot, lockDir, STATE_FILE);
}

export async function loadHarnessTransitionState(
  worktreeRoot: string,
  lockDir = '.harness',
): Promise<HarnessTransitionState | null> {
  try {
    const raw = JSON.parse(await readFile(harnessStatePath(worktreeRoot, lockDir), 'utf-8'));
    const parsed = HarnessTransitionStateSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    return null;
  }
}

export async function persistHarnessTransition(input: {
  readonly worktreeRoot: string;
  readonly lockDir?: string;
  readonly from: HarnessState;
  readonly to: HarnessState;
  readonly attempts: number;
  readonly challengesUsed: number;
  readonly redVerified: boolean;
  readonly sealHash: string;
  readonly sealedPaths: readonly string[];
  readonly assertionBaseline: ReadonlyMap<string, number>;
}): Promise<void> {
  const lockDir = input.lockDir ?? '.harness';
  const previous = await loadHarnessTransitionState(input.worktreeRoot, lockDir);
  const updatedAt = new Date().toISOString();
  const transitions = [
    ...(previous?.transitions ?? []),
    { from: input.from, to: input.to, at: updatedAt },
  ].slice(-50);
  const body: HarnessTransitionState = {
    version: 1,
    state: input.to,
    attempts: input.attempts,
    challengesUsed: input.challengesUsed,
    redVerified: input.redVerified,
    sealHash: input.sealHash,
    sealedPaths: [...input.sealedPaths],
    assertionBaseline: Object.fromEntries(input.assertionBaseline),
    updatedAt,
    transitions,
  };
  await writeFileAtomic(harnessStatePath(input.worktreeRoot, lockDir), `${JSON.stringify(body, null, 2)}\n`);
}
