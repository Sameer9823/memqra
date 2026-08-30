import type { MemoryConflict, ConflictResolutionStrategy, ConflictStatus } from "@memorie/types";

/**
 * Optional projection. Stores explicit `MemoryConflict` records raised by
 * the evolution pipeline (spec section 17). Not authoritative over the
 * memories themselves — see docs/ARCHITECTURE.md.
 */
export interface ConflictStore {
  record(conflict: MemoryConflict): Promise<void>;

  get(id: string): Promise<MemoryConflict | null>;

  list(options?: { memoryId?: string; status?: ConflictStatus }): Promise<MemoryConflict[]>;

  resolve(
    id: string,
    resolution: ConflictResolutionStrategy,
    resolvedMemoryId: string | undefined,
    resolvedAt: Date,
  ): Promise<MemoryConflict>;
}
