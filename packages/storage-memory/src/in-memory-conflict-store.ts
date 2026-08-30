import type { ConflictStore } from "@memorie/storage";
import type { MemoryConflict, ConflictResolutionStrategy, ConflictStatus } from "@memorie/types";
import { MemoryNotFoundError } from "@memorie/types";

/**
 * Simple in-memory ConflictStore. Not persistent; primarily intended for
 * tests, local prototyping, and as a reference implementation of the
 * ConflictStore contract.
 */
export class InMemoryConflictStore implements ConflictStore {
  private readonly conflicts = new Map<string, MemoryConflict>();

  async record(conflict: MemoryConflict): Promise<void> {
    this.conflicts.set(conflict.id, structuredClone(conflict));
  }

  async get(id: string): Promise<MemoryConflict | null> {
    const found = this.conflicts.get(id);
    return found ? structuredClone(found) : null;
  }

  async list(options?: { memoryId?: string; status?: ConflictStatus }): Promise<MemoryConflict[]> {
    let results = [...this.conflicts.values()];
    if (options?.memoryId !== undefined) {
      const memoryId = options.memoryId;
      results = results.filter((c) => c.memoryA === memoryId || c.memoryB === memoryId);
    }
    if (options?.status !== undefined) {
      results = results.filter((c) => c.status === options.status);
    }
    return results.map((c) => structuredClone(c));
  }

  async resolve(
    id: string,
    resolution: ConflictResolutionStrategy,
    resolvedMemoryId: string | undefined,
    resolvedAt: Date,
  ): Promise<MemoryConflict> {
    const existing = this.conflicts.get(id);
    if (!existing) {
      throw new MemoryNotFoundError(id, { details: { kind: "conflict" } });
    }
    const resolved: MemoryConflict = {
      ...existing,
      status: "resolved",
      resolution,
      resolvedMemoryId,
      resolvedAt,
    };
    this.conflicts.set(id, resolved);
    return structuredClone(resolved);
  }
}
