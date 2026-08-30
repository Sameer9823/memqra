import type { DuplicateDetector } from "@memorie/types";

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Duplicate policy (spec section 16): byte-for-byte identical content. */
export function createExactTextDuplicateDetector(): DuplicateDetector {
  return {
    async check(input, existing) {
      const isDuplicate = input.content === existing.content;
      return {
        isDuplicate,
        confidence: isDuplicate ? 1.0 : 0.0,
        reason: isDuplicate ? "exact content match" : "content differs",
      };
    },
  };
}

/**
 * Duplicate policy (spec section 16, default): content equal after
 * trimming, lower-casing, and collapsing whitespace. Catches re-submits
 * that differ only in incidental formatting without requiring an
 * embedding model.
 */
export function createNormalizedTextDuplicateDetector(): DuplicateDetector {
  return {
    async check(input, existing) {
      const isDuplicate = normalize(input.content) === normalize(existing.content);
      return {
        isDuplicate,
        confidence: isDuplicate ? 1.0 : 0.0,
        reason: isDuplicate ? "normalized content match" : "content differs after normalization",
      };
    },
  };
}
