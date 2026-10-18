import { Buffer } from 'node:buffer';

export interface ContextFragment {
  readonly source: 'rules' | 'scope' | 'ledger' | 'memory' | 'evidence' | 'compaction';
  readonly content: string;
  /** Names the fragment in budget diagnostics. */
  readonly id?: string;
  /** Required fragments are never omitted; if they do not fit, the assembly reports it. */
  readonly required?: boolean;
}

export interface ContextBudgetBlock {
  readonly code: 'context_budget_exceeded';
  readonly elements: readonly string[];
  readonly requiredBytes: number;
  readonly maxBytes: number;
}

export interface ContextAssembly {
  readonly fragments: readonly ContextFragment[];
  readonly contextBytes: number;
  readonly omittedSources: readonly ContextFragment['source'][];
  readonly blocking: readonly ContextBudgetBlock[];
}

const SOURCE_ORDER: readonly ContextFragment['source'][] = [
  'rules',
  'ledger',
  'scope',
  'memory',
  'evidence',
  'compaction',
];

/** Assemble bounded context in a fixed source order, without truncating fragments. */
export function assembleContext(
  fragments: readonly ContextFragment[],
  maxBytes: number,
): ContextAssembly {
  const bytesOf = (fragment: ContextFragment): number => Buffer.byteLength(fragment.content, 'utf-8');
  const required = fragments.filter((fragment) => fragment.required === true);
  const requiredBytes = required.reduce((sum, fragment) => sum + bytesOf(fragment), 0);
  let contextBytes = requiredBytes;
  const accepted: ContextFragment[] = [];
  const omittedSources: ContextFragment['source'][] = [];
  for (const source of SOURCE_ORDER) {
    for (const fragment of fragments.filter((candidate) => candidate.source === source)) {
      if (fragment.required === true) {
        accepted.push(fragment);
        continue;
      }
      const bytes = bytesOf(fragment);
      if (contextBytes + bytes > maxBytes) {
        omittedSources.push(source);
        continue;
      }
      accepted.push(fragment);
      contextBytes += bytes;
    }
  }
  const blocking: ContextBudgetBlock[] =
    requiredBytes > maxBytes
      ? [
          {
            code: 'context_budget_exceeded',
            elements: required.map((fragment) => fragment.id ?? fragment.source).sort(),
            requiredBytes,
            maxBytes,
          },
        ]
      : [];
  return { fragments: accepted, contextBytes, omittedSources, blocking };
}

export function resumeDecision(changedPaths: readonly string[]):
  | { readonly status: 'ready' }
  | { readonly status: 'needs_decision'; readonly changedPaths: readonly string[]; readonly question: string } {
  if (changedPaths.length === 0) return { status: 'ready' };
  return {
    status: 'needs_decision',
    changedPaths,
    question: `Workspace changed in ${changedPaths.join(', ')}. Continue with the current workspace?`,
  };
}
