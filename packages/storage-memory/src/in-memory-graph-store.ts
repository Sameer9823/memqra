import type { GraphStore } from "@memorie/storage";
import type { Memory, MemoryRelation, GraphQueryOptions, TraversalOptions } from "@memorie/types";

type MemoryResolver = (id: string) => Promise<Memory | null> | Memory | null;

/**
 * Simple in-memory GraphStore. Relations are stored by id/type only —
 * per spec section 4/22, a GraphStore is a non-authoritative projection,
 * so full `Memory` objects are resolved on demand via the injected
 * `resolveMemory` function (typically `memoryStore.get`). Primarily
 * intended for tests, local prototyping, and as a reference
 * implementation of the GraphStore contract.
 */
export class InMemoryGraphStore implements GraphStore {
  private readonly relations = new Map<string, MemoryRelation>();

  constructor(private readonly resolveMemory: MemoryResolver) {}

  async createRelation(relation: MemoryRelation): Promise<void> {
    this.relations.set(relation.id, structuredClone(relation));
  }

  async deleteRelation(relationId: string): Promise<void> {
    this.relations.delete(relationId);
  }

  /** See GraphStore.listRelations() — enables engine.export() to include relations. */
  async listRelations(): Promise<MemoryRelation[]> {
    return [...this.relations.values()].map((r) => structuredClone(r));
  }

  async getRelated(memoryId: string, options?: GraphQueryOptions): Promise<Memory[]> {
    const ids = this.neighborIds(memoryId, options);
    const limited = options?.limit ? ids.slice(0, options.limit) : ids;
    return this.resolveAll(limited);
  }

  async traverse(memoryId: string, options?: TraversalOptions): Promise<Memory[]> {
    const maxDepth = options?.maxDepth ?? 1;
    const visited = new Set<string>([memoryId]);
    const collected: string[] = [];
    let frontier = [memoryId];

    for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const neighborId of this.neighborIds(id, options)) {
          if (!visited.has(neighborId)) {
            visited.add(neighborId);
            collected.push(neighborId);
            next.push(neighborId);
          }
        }
      }
      frontier = next;
    }

    const limited = options?.limit ? collected.slice(0, options.limit) : collected;
    return this.resolveAll(limited);
  }

  private neighborIds(memoryId: string, options?: GraphQueryOptions): string[] {
    const direction = options?.direction ?? "outgoing";
    const results: string[] = [];
    for (const relation of this.relations.values()) {
      if (options?.types && !options.types.includes(relation.type)) continue;
      if (options?.minWeight !== undefined && (relation.weight ?? 0) < options.minWeight) continue;
      if ((direction === "outgoing" || direction === "both") && relation.fromMemoryId === memoryId) {
        results.push(relation.toMemoryId);
      }
      if ((direction === "incoming" || direction === "both") && relation.toMemoryId === memoryId) {
        results.push(relation.fromMemoryId);
      }
    }
    return results;
  }

  private async resolveAll(ids: string[]): Promise<Memory[]> {
    const memories: Memory[] = [];
    for (const id of ids) {
      const memory = await this.resolveMemory(id);
      if (memory) memories.push(memory);
    }
    return memories;
  }
}
