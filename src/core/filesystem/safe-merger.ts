export const MANAGED_BEGIN_MARKER = '<!-- CODECONDUCTOR:BEGIN managed -->'
export const MANAGED_END_MARKER = '<!-- CODECONDUCTOR:END managed -->'

export interface ManagedMergeResult {
  readonly content: string
  readonly action: 'written' | 'merged'
}

export function mergeManagedBlock(existing: string | null, incoming: string): ManagedMergeResult {
  validateMarkers(incoming, 'incoming content')

  if (!existing) {
    return { content: incoming, action: 'written' }
  }

  validateMarkers(existing, 'existing content')

  const existingBlock = getManagedBlockRange(existing)
  const incomingBlock = getManagedBlockRange(incoming)

  return {
    content: existing.slice(0, existingBlock.start) +
      incoming.slice(incomingBlock.start, incomingBlock.end) +
      existing.slice(existingBlock.end),
    action: 'merged'
  }
}

function validateMarkers(content: string, label: string): void {
  const beginCount = countOccurrences(content, MANAGED_BEGIN_MARKER)
  const endCount = countOccurrences(content, MANAGED_END_MARKER)

  if (beginCount !== 1 || endCount !== 1) {
    throw new Error(`${label} must contain exactly one managed begin marker and one managed end marker`)
  }

  if (content.indexOf(MANAGED_BEGIN_MARKER) > content.indexOf(MANAGED_END_MARKER)) {
    throw new Error(`${label} has managed markers in the wrong order`)
  }
}

function getManagedBlockRange(content: string): { start: number; end: number } {
  const start = content.indexOf(MANAGED_BEGIN_MARKER)
  const end = content.indexOf(MANAGED_END_MARKER) + MANAGED_END_MARKER.length
  return { start, end }
}

function countOccurrences(content: string, needle: string): number {
  return content.split(needle).length - 1
}
