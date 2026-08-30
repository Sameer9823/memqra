import type { ConflictDetector, Memory, MemoryIntelligenceProvider } from "@memorie/types";

/**
 * Default conflict detector (spec section 17).
 *
 * Genuine conflict detection ("preferred_language=TypeScript" vs
 * "preferred_language=Python") requires understanding whether two pieces
 * of content actually assert incompatible things, not just that they
 * differ — that needs semantic judgement. Rather than fake it with a
 * naive "any content change under the same identity is a conflict"
 * rule (which would flag ordinary refinements like the TypeScript
 * example in spec section 3 as conflicts), this default only calls out
 * to an optional `MemoryIntelligenceProvider.compare()`.
 *
 * Without one configured, matched identities are always treated as
 * non-conflicting updates — a documented, honest limitation (spec
 * section 77), not a guess. Configure a `MemoryIntelligenceProvider` for
 * real conflict detection, or supply a custom `ConflictDetector`.
 */
export function createDefaultConflictDetector(intelligence?: MemoryIntelligenceProvider): ConflictDetector {
  return {
    async check(input, existing) {
      if (!intelligence) {
        return {
          isConflict: false,
          confidence: 0,
          type: "none",
          reason: "no MemoryIntelligenceProvider configured; matched identities are treated as updates by default",
        };
      }

      const candidate: Memory = { ...existing, content: input.content };
      const comparison = await intelligence.compare(existing, candidate);

      if (comparison.relation === "contradicts") {
        return {
          isConflict: true,
          confidence: comparison.confidence,
          type: "value-mismatch",
          reason: comparison.explanation ?? "MemoryIntelligenceProvider reported a contradiction",
        };
      }

      return {
        isConflict: false,
        confidence: comparison.confidence,
        type: "none",
        reason: comparison.explanation ?? `MemoryIntelligenceProvider reported: ${comparison.relation}`,
      };
    },
  };
}
