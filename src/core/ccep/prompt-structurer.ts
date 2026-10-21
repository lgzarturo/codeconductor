/**
 * Prompt structurer — deterministic Task Card envelope assembly.
 *
 * Wraps a raw request in <context>/<constraints>/<task> delimiters grounded
 * in repo state (goal, target, policy, resolved scope). The request is echoed
 * verbatim (XML-escaped); model-based denoising or rewriting is explicitly
 * out of scope — the harness has no model-call infrastructure.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { resolveScopeFiles } from '../code-index/code-index';
import { loadConfig } from '../config/config-loader';
import { loadGoal } from '../goal/goal-state';

export interface StructureInput {
  readonly request: string;
  readonly scope?: readonly string[];
  readonly role?: string;
  readonly type?: string;
}

export interface StructuredCard {
  readonly title: string;
  readonly type: string;
  readonly role: string;
  readonly scopeIn: string[];
  readonly scopeFiles: string[];
}

export interface StructuredPrompt {
  readonly card: StructuredCard;
  readonly envelope: string;
  readonly warnings: string[];
}

const ROLE_SURFACE: Record<string, string> = {
  implementer: 'implementer: write production files in scope; test files are read-only.',
  tester: 'tester: test files only; production code is read-only.',
  reviewer: 'reviewer: read-only; no source writes.',
  architect: 'architect: docs and plans only; no source writes.',
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

interface PolicyBits {
  readonly found: boolean;
  readonly networkDefault: string;
  readonly allowDomains: string[];
  readonly denyRead: string[];
  readonly denyWrite: string[];
}

async function readPolicyBits(projectRoot: string): Promise<PolicyBits> {
  const empty: PolicyBits = {
    found: false,
    networkDefault: 'unknown',
    allowDomains: [],
    denyRead: [],
    denyWrite: [],
  };
  let raw: string;
  try {
    raw = await readFile(resolve(projectRoot, 'policy.yml'), 'utf-8');
  } catch {
    return empty;
  }
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch {
    return empty;
  }
  if (typeof parsed !== 'object' || parsed === null) return empty;
  const doc = parsed as Record<string, unknown>;
  const runtime = (doc.runtime ?? {}) as Record<string, unknown>;
  const network = (runtime.network ?? {}) as Record<string, unknown>;
  return {
    found: true,
    networkDefault: typeof network.default === 'string' ? network.default : 'unknown',
    allowDomains: asStringArray(network.allowDomains),
    denyRead: asStringArray(doc.denyRead),
    denyWrite: asStringArray(doc.denyWrite),
  };
}

export async function structurePrompt(
  projectRoot: string,
  input: StructureInput,
): Promise<StructuredPrompt> {
  const warnings: string[] = [];
  const role = input.role?.trim() || 'implementer';
  const type = input.type?.trim() || 'feature';
  const request = input.request.trim();
  const firstLine = request.split('\n')[0] ?? '';
  const title = firstLine.length > 120 ? `${firstLine.slice(0, 117)}...` : firstLine;

  const scopeIn = [...(input.scope ?? [])];
  let scopeFiles: string[] = [];
  if (scopeIn.length === 0) {
    warnings.push('no scope entries supplied; card is unbounded — add --scope.');
  } else {
    const resolved = await resolveScopeFiles(projectRoot, { in: scopeIn });
    if (!resolved.success) {
      warnings.push(`scope unresolved (${resolved.error.message}).`);
    } else {
      scopeFiles = resolved.data;
      if (scopeFiles.length === 0) {
        warnings.push(`scope entries [${scopeIn.join(', ')}] matched no indexed files.`);
      }
    }
  }

  const goal = await loadGoal(projectRoot);
  const objective = goal.success ? goal.data.objective : 'none (no current-goal.yml)';
  const config = await loadConfig(projectRoot);
  const target = config.success ? config.data.defaults.target : 'unknown';

  const policy = await readPolicyBits(projectRoot);
  if (!policy.found) {
    warnings.push('policy.yml not found; using baseline constraints.');
  }

  const contextLines = [
    `goal: ${objective}`,
    `target: ${target}`,
    `role: ${role} | type: ${type}`,
    scopeFiles.length > 0
      ? `scope files (${scopeFiles.length}): ${scopeFiles.join(', ')}`
      : 'scope files (0): none',
  ];
  const constraintLines = [
    policy.found
      ? `network: ${policy.networkDefault} by default${policy.allowDomains.length > 0 ? ` (allow: ${policy.allowDomains.join(', ')})` : ''}`
      : 'network: unknown policy — treat external calls as denied.',
    ...(policy.denyRead.length > 0 ? [`read-denied: ${policy.denyRead.join(', ')}`] : []),
    ...(policy.denyWrite.length > 0 ? [`write-denied: ${policy.denyWrite.join(', ')}`] : []),
    'never emit secrets, credentials, tokens, or private keys in code, logs, or output.',
    ROLE_SURFACE[role] ?? `role '${role}' has no pinned write surface; writes require hook approval.`,
    'minimal diff: touch only scope files; no unrelated refactors.',
  ];

  const envelope = [
    '<context>',
    ...contextLines.map(escapeXml),
    '</context>',
    '<constraints>',
    ...constraintLines.map((line) => `- ${escapeXml(line)}`),
    '</constraints>',
    '<task>',
    escapeXml(request),
    '</task>',
  ].join('\n');

  return {
    card: { title, type, role, scopeIn, scopeFiles },
    envelope,
    warnings,
  };
}
