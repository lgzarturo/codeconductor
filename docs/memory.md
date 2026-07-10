# Memory Index — User Guide

The memory index is the **persistent pointer layer** of CodeConductor's 3-layer memory architecture. It stores lightweight references to observations kept in Engram, enabling fast topic-based lookup without reloading full session history.

## Architecture

```
Layer 1: Session History   (ephemeral, in-memory)
Layer 2: Compaction Cache   (ephemeral, per-session file)
Layer 3: Memory Index       (persistent, .codeconductor/memory.md)
```

The memory index sits at Layer 3. Each pointer contains:

| Field        | Type     | Description                                      |
| ------------ | -------- | ------------------------------------------------ |
| `topic_key`  | `string` | Stable identifier for the topic (e.g. `architecture/auth-model`) |
| `id`         | `number` | Engram observation ID                            |
| `file`       | `string` | Path to the observation file                     |
| `summary`    | `string` | One-line description (max 200 chars)             |
| `timestamp`  | `string` | ISO 8601 datetime of when the observation was created |
| `tags`       | `string[]` | Optional tags for filtering (max 10 items)     |

## On-Disk Format

The index lives at `.codeconductor/memory.md` — a Markdown file that is both human-readable and machine-parseable:

```markdown
# Memory Index

> **Do not edit the YAML block below manually.** Use the `memory-index` API.

<!-- memory-index-start -->
```yaml
version: 1
pointers:
  - topic_key: architecture/auth-model
    id: 1
    file: engram/obs-1.md
    summary: JWT auth decision
    timestamp: "2025-01-15T10:30:00Z"
    tags: [auth, jwt]
```
<!-- memory-index-end -->

---

_Last updated: 2025-01-15T10:30:00.000Z · Total pointers: 1_
```

The sentinel HTML comments (`<!-- memory-index-start -->` / `<!-- memory-index-end -->`) delimit the machine-parseable YAML block. This lets agents extract the index via regex without needing to parse the full Markdown.

## API Usage

```typescript
import {
  loadMemoryIndex,
  saveMemoryIndex,
  addPointer,
  updatePointer,
  deletePointer,
  findByTopicKey,
} from './src/core/memory/memory-index';

// Load existing index
const result = await loadMemoryIndex(projectRoot);
if (result.success) {
  const pointers = findByTopicKey(result.data, 'architecture/auth-model');
}

// Add a pointer
const idx = addPointer(currentIndex, {
  topic_key: 'bugfix/n+1-query',
  id: 42,
  file: 'engram/obs-42.md',
  summary: 'Fixed N+1 in user list query',
  timestamp: new Date().toISOString(),
  tags: ['bugfix', 'performance'],
});

// Save back to disk
await saveMemoryIndex(projectRoot, idx);
```

## Truncation Strategy

The memory index enforces a **40KB size limit** (40,960 bytes) to prevent the file from growing unbounded:

1. Before writing, `saveMemoryIndex()` measures the full rendered Markdown file size via `Buffer.byteLength()`.
2. If it exceeds 40KB, pointers are sorted by `timestamp` ascending (oldest first).
3. The oldest pointer is removed, and the size is re-measured.
4. This repeats until the file is under the limit.
5. A console warning is emitted: `Memory index truncated: removed N oldest pointers to stay under 40KB.`
6. The file footer reflects the truncation: `Total pointers: M (truncated from N)`.

This ensures the index stays small enough for agents to load quickly while preserving the most recent observations.

## Design Decisions

- **Immutable helpers**: `addPointer`, `updatePointer`, `deletePointer` return new objects rather than mutating in place. This prevents accidental state corruption.
- **YAML in Markdown**: Using sentinel-delimited YAML inside a Markdown file means the index is readable by humans in any editor, while agents can extract the data with a simple regex.
- **Topic key as primary key**: The `topic_key` field uniquely identifies a pointer. This aligns with Engram's topic-based memory model where observations are grouped by topic.
