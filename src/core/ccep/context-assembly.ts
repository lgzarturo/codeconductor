import { Buffer } from 'node:buffer';

export interface ContextFragment {
  readonly source: 'scope' | 'ledger' | 'memory' | 'evidence' | 'compaction';
  readonly content: string;
}

export interface ContextAssembly {
  readonly fragments: readonly ContextFragment[];
  readonly contextBytes: number;
  readonly omittedSources: readonly ContextFragment['source'][];
}

const SOURCE_ORDER: readonly ContextFragment['source'][] = [
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
  let contextBytes = 0;
  const accepted: ContextFragment[] = [];
  const omittedSources: ContextFragment['source'][] = [];
  for (const source of SOURCE_ORDER) {
    for (const fragment of fragments.filter((candidate) => candidate.source === source)) {
      const bytes = Buffer.byteLength(fragment.content, 'utf-8');
      if (contextBytes + bytes > maxBytes) {
        omittedSources.push(source);
        continue;
      }
      accepted.push(fragment);
      contextBytes += bytes;
    }
  }
  return { fragments: accepted, contextBytes, omittedSources };
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
