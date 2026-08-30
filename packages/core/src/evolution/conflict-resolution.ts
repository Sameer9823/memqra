import type { Memory, ConflictResolutionStrategy, MemoryIntelligenceProvider } from "@memorie/types";
import { UnsupportedCapabilityError } from "@memorie/types";

export interface ResolutionDecision {
  winner: Memory;
  loser?: Memory;
  /**
   * Present only for "merge": the consolidated memory produced by the
   * configured MemoryIntelligenceProvider. Neither `memoryA` nor
   * `memoryB` "wins" in this case — both become sources of a new memory.
   */
  merged?: Memory;
}

/**
 * Applies a `ConflictResolutionStrategy` (spec section 17) to a pair of
 * conflicting memories and decides the outcome. Does not mutate any
 * store — the caller (MemoryEngine.resolveConflict) is responsible for
 * persisting the decision.
 */
export async function decideResolution(
  strategy: ConflictResolutionStrategy,
  memoryA: Memory,
  memoryB: Memory,
  intelligence?: MemoryIntelligenceProvider,
): Promise<ResolutionDecision> {
  switch (strategy) {
    case "latest": {
      const bIsNewer = memoryB.createdAt.getTime() >= memoryA.createdAt.getTime();
      return bIsNewer ? { winner: memoryB, loser: memoryA } : { winner: memoryA, loser: memoryB };
    }
    case "supersede":
      // memoryB is, by construction of the ingest pipeline, the incoming
      // (newer) side of the conflict — it always supersedes memoryA.
      return { winner: memoryB, loser: memoryA };
    case "highest-confidence": {
      const bWins = memoryB.confidence >= memoryA.confidence;
      return bWins ? { winner: memoryB, loser: memoryA } : { winner: memoryA, loser: memoryB };
    }
    case "highest-importance": {
      const bWins = memoryB.importance >= memoryA.importance;
      return bWins ? { winner: memoryB, loser: memoryA } : { winner: memoryA, loser: memoryB };
    }
    case "merge": {
      if (!intelligence) {
        throw new UnsupportedCapabilityError(
          "conflict resolution strategy 'merge' requires a MemoryIntelligenceProvider to be configured",
        );
      }
      const merged = await intelligence.consolidate([memoryA, memoryB]);
      return { winner: merged, merged };
    }
    case "manual":
      throw new UnsupportedCapabilityError(
        "conflict resolution strategy 'manual' means the engine will not auto-resolve; " +
          "call resolveConflict(conflictId, <strategy>) with an explicit strategy",
      );
  }
}
