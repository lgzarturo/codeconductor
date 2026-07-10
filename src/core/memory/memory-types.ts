/**
 * Types for the memory index — the persistent pointer layer of the 3-layer
 * memory architecture. Pointers are lightweight references to observations
 * stored in Engram, enabling fast lookup without loading full session history.
 */

export interface MemoryPointer {
  topic_key: string;
  id: number;
  file: string;
  summary: string;
  timestamp: string;
  tags: string[];
}

export interface MemoryIndex {
  version: 1;
  pointers: MemoryPointer[];
}
