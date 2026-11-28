/**
 * StackVerifier — native verification adapters per language stack.
 *
 * Missing tools return GateResult status `unverified` (never an implicit pass).
 */

import type { GateResult } from './harness/types';
import { typescriptStackVerifier } from './stack-verifiers/typescript';

export interface VerificationContext {
  readonly root: string;
  readonly files?: readonly string[];
  readonly command?: string | string[];
  readonly timeoutMs?: number;
}

export interface StackVerifier {
  readonly id: string;
  readonly capabilities: readonly string[];
  detect(root: string): Promise<boolean>;
  verify(context: VerificationContext): Promise<GateResult>;
}

const REGISTRY: readonly StackVerifier[] = [typescriptStackVerifier];

export function listStackVerifiers(): readonly StackVerifier[] {
  return REGISTRY;
}

export async function detectStackVerifiers(root: string): Promise<StackVerifier[]> {
  const found: StackVerifier[] = [];
  for (const verifier of REGISTRY) {
    if (await verifier.detect(root)) found.push(verifier);
  }
  return found;
}

export async function verifyWithStack(
  id: string,
  context: VerificationContext,
): Promise<GateResult> {
  const verifier = REGISTRY.find((v) => v.id === id);
  if (!verifier) {
    return {
      gateId: `stack:${id}`,
      status: 'unverified',
      violations: [],
      detail: `Unknown stack verifier: ${id}`,
    };
  }
  if (!(await verifier.detect(context.root))) {
    return {
      gateId: `stack:${id}`,
      status: 'unverified',
      violations: [],
      detail: `Stack verifier ${id} does not apply to ${context.root}`,
    };
  }
  return verifier.verify(context);
}
