import type { Memory } from "./memory.js";
import type { MemoryConflict } from "./conflict.js";
import type { MemoryRelation } from "./relations.js";

export interface MemorieEventMap {
  "memory.created": { memory: Memory };
  "memory.updated": { memory: Memory; previous: Memory };
  "memory.deleted": { memoryId: string };
  "memory.accessed": { memory: Memory };
  "memory.merged": { memory: Memory; mergedFrom: string[] };
  "memory.consolidated": { memory: Memory; sourceIds: string[] };
  "memory.superseded": { previous: Memory; next: Memory };
  "memory.expired": { memory: Memory };
  "memory.conflict_detected": { conflict: MemoryConflict };
  "memory.version_created": { memoryId: string; version: number };
  "memory.relation_created": { relation: MemoryRelation };
  "memory.relation_deleted": { relationId: string };
}

export type MemorieEventName = keyof MemorieEventMap;
