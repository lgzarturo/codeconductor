/**
 * TypeScript StackVerifier — runs project-local `tsc --noEmit`.
 * Missing compiler → unverified (never an implicit pass).
 */

import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { runCompileCheck } from '../../compilation/compile-checker';
import type { GateResult } from '../harness/types';
import type { StackVerifier, VerificationContext } from '../stack-verifier';

async function hasTsconfig(root: string): Promise<boolean> {
  for (const name of ['tsconfig.json', 'tsconfig.build.json']) {
    try {
      await access(join(root, name));
      return true;
    } catch {
      // try next
    }
  }
  return false;
}

async function resolveLocalTsc(root: string): Promise<string | null> {
  const candidates = [
    join(root, 'node_modules', '.bin', 'tsc'),
    join(root, 'node_modules', 'typescript', 'bin', 'tsc'),
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // try next
    }
  }
  return null;
}

export const typescriptStackVerifier: StackVerifier = {
  id: 'typescript',
  capabilities: ['typecheck', 'compile'],

  async detect(root: string): Promise<boolean> {
    return hasTsconfig(root);
  },

  async verify(context: VerificationContext): Promise<GateResult> {
    const gateId = 'stack:typescript';
    const tsc = await resolveLocalTsc(context.root);
    if (tsc === null) {
      return {
        gateId,
        status: 'unverified',
        violations: [],
        detail: 'TypeScript compiler (tsc) is not installed in this project',
      };
    }

    const command = context.command ?? [tsc, '--noEmit'];
    const result = await runCompileCheck({
      command,
      cwd: context.root,
      timeoutMs: context.timeoutMs,
    });

    if (result.timedOut) {
      return {
        gateId,
        status: 'failed',
        violations: ['typescript typecheck timed out'],
        detail: result.stderr.slice(0, 500) || undefined,
      };
    }

    if (result.success) {
      return {
        gateId,
        status: 'passed',
        violations: [],
        detail: `tsc --noEmit ok (${Math.round(result.durationMs)}ms)`,
        evidenceRefs: context.files,
      };
    }

    const messages =
      result.errors.length > 0
        ? result.errors.slice(0, 20).map((e) => `${e.file}:${e.line ?? '?'}: ${e.message}`)
        : [result.stderr.trim() || result.stdout.trim() || `tsc exited ${result.exitCode}`];

    return {
      gateId,
      status: 'failed',
      violations: messages,
      detail: `tsc --noEmit failed (exit ${result.exitCode})`,
    };
  },
};
