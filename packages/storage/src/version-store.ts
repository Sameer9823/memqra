import type { MemoryVersion } from "@memorie/types";

/**
 * Stores immutable historical versions of memories. Never mutated after
 * creation. Used to power memory.history(), memory.getVersion() and
 * memory.getAt() (time travel).
 */
export interface VersionStore {
  append(version: MemoryVersion): Promise<void>;

  list(memoryId: string): Promise<MemoryVersion[]>;

  get(memoryId: string, version: number): Promise<MemoryVersion | null>;

  /** Return the version that was current at `timestamp`, or null if none existed yet. */
  getAt(memoryId: string, timestamp: Date): Promise<MemoryVersion | null>;

  deleteAll(memoryId: string): Promise<void>;
}
