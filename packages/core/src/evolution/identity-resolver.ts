import type { IdentityResolver } from "@memorie/types";

/**
 * Default identity resolver (spec section 7).
 *
 * Without an AI provider, Memorie cannot reliably tell whether two pieces
 * of free text describe "the same fact" (that requires semantic/entity
 * understanding — see `docs/MEMORY-EVOLUTION.md`). What it *can* do
 * safely is honor an explicit, caller-supplied identity: if the incoming
 * input carries `metadata[identityKey]` (default: `"key"`, e.g.
 * `{ key: "preferred_language" }`), any existing candidate in the same
 * scope with the same `metadata[identityKey]` is the same identity.
 *
 * Inputs without an identity key are always treated as having no
 * resolvable identity (`null`) — they fall through to duplicate
 * detection and, failing that, are created as new memories. This is a
 * deliberate, documented limitation rather than a fake heuristic (spec
 * section 77): plug in a custom `IdentityResolver` (e.g. backed by a
 * `MemoryIntelligenceProvider`) for semantic identity resolution.
 */
export function createDefaultIdentityResolver(identityKey = "key"): IdentityResolver {
  return {
    async resolve(input, candidates) {
      const inputKey = input.metadata?.[identityKey];
      if (inputKey === undefined) {
        return null;
      }
      const matches = candidates.filter((candidate) => candidate.metadata?.[identityKey] === inputKey);
      if (matches.length === 0) {
        return null;
      }
      // Multiple active memories can share an identity key while a
      // conflict between them is still unresolved. In that case, the
      // most recently updated one represents the current authoritative
      // state of that identity.
      const match = matches.reduce((latest, candidate) =>
        candidate.updatedAt.getTime() > latest.updatedAt.getTime() ? candidate : latest,
      );
      return {
        memoryId: match.id,
        confidence: 1.0,
        reason: `matched metadata.${identityKey}`,
      };
    },
  };
}
