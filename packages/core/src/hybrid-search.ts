import type {
  Memory,
  SearchQuery,
  SearchResult,
  RankingWeights,
  MemoryFilters,
  EmbeddingProvider,
} from "@memorie/types";
import type { MemoryStore, SearchStore, VectorStore, GraphStore } from "@memorie/storage";
import { keywordScore } from "./keyword-search.js";
import { recencyScore, frequencyScore } from "./ranking.js";

type SignalKey = keyof RankingWeights;
type MatchedSignal = NonNullable<SearchResult["matchedSignals"]>[number];

interface Candidate {
  memory: Memory;
  signals: Partial<Record<SignalKey, number>>;
  matchedSignals: Set<MatchedSignal>;
}

export interface HybridSearchDeps {
  memoryStore: MemoryStore;
  searchStore?: SearchStore;
  vectorStore?: VectorStore;
  /** Required alongside vectorStore to embed the query text and enable the "semantic" signal. */
  embeddingProvider?: EmbeddingProvider;
  /** Required alongside query.relatedTo to enable the "relationship" signal (spec section 25/27, Phase 5). */
  graphStore?: GraphStore;
}

/**
 * A memory found outside the structural candidate pool (e.g. because the
 * pool was capped by `limit`, or because it lives entirely outside the
 * canonical scope filters as far as a secondary index is concerned) must
 * be re-validated against the query's scope/filters before being added —
 * secondary stores are not authoritative and must never be trusted to
 * enforce tenant isolation or filters on the core's behalf
 * (docs/ARCHITECTURE.md, docs/SECURITY.md).
 */
function matchesQueryScope(memory: Memory, query: SearchQuery): boolean {
  if (query.tenantId !== undefined && memory.tenantId !== query.tenantId) return false;
  if (query.namespace !== undefined && memory.namespace !== query.namespace) return false;
  if (query.subjectId !== undefined && memory.subjectId !== query.subjectId) return false;
  return matchesFilters(memory, query.filters);
}

function matchesFilters(memory: Memory, filters?: MemoryFilters): boolean {
  if (!filters) return true;
  if (filters.type) {
    const types = Array.isArray(filters.type) ? filters.type : [filters.type];
    if (!types.includes(memory.type)) return false;
  }
  if (filters.state) {
    const states = Array.isArray(filters.state) ? filters.state : [filters.state];
    if (!states.includes(memory.state)) return false;
  }
  return true;
}

/**
 * The hybrid retrieval pipeline described in spec section 25:
 *
 *   Query -> structured candidates -> keyword candidates -> semantic
 *   candidates -> graph candidates -> merge -> deduplicate -> rank ->
 *   return
 *
 * Every stage degrades gracefully: with no SearchStore configured, the
 * "keyword" stage scores canonical content directly instead of querying
 * an index; with no VectorStore+EmbeddingProvider configured, there is no
 * "semantic" stage at all and its ranking weight is redistributed across
 * the remaining signals; with no GraphStore configured (or no
 * `query.relatedTo`), there is no "relationship" stage either. This is
 * what makes `engine.search()` work with zero optional adapters
 * configured (docs/ARCHITECTURE.md, "graceful degradation").
 */
export async function hybridSearch(
  query: SearchQuery,
  deps: HybridSearchDeps,
  weights: RankingWeights,
  now: Date,
): Promise<SearchResult[]> {
  const candidates = new Map<string, Candidate>();
  const hasQueryText = Boolean(query.query && query.query.trim() !== "");
  const hasGraphSeed = Boolean(query.relatedTo && deps.graphStore);

  // --- Structured candidates: always sourced from canonical storage. ---
  const structuralLimit = query.limit ? Math.max(query.limit * 5, 50) : undefined;
  const structural = await deps.memoryStore.list({
    tenantId: query.tenantId,
    namespace: query.namespace,
    subjectId: query.subjectId,
    filters: query.filters,
    limit: structuralLimit,
  });

  for (const memory of structural) {
    candidates.set(memory.id, {
      memory,
      signals: {
        importance: memory.importance,
        confidence: memory.confidence,
        recency: recencyScore(memory.updatedAt, now),
        frequency: frequencyScore(memory.accessCount),
        // When a free-text query is present, "keyword" (and, if a vector
        // search will run, "semantic") are *globally available* signals
        // for this search — every candidate gets a baseline of 0 so later
        // weight-normalization doesn't rank a non-match above a match
        // (see combineSignals docstring below). Overwritten with real
        // scores for actual matches.
        ...(hasQueryText ? { keyword: 0 } : {}),
        ...(hasQueryText && deps.vectorStore && deps.embeddingProvider ? { semantic: 0 } : {}),
        ...(hasGraphSeed ? { relationship: 0 } : {}),
      },
      matchedSignals: new Set<MatchedSignal>(["structured"]),
    });
  }

  // --- Keyword candidates. ---
  if (hasQueryText) {
    if (deps.searchStore) {
      const searchResults = await deps.searchStore.search(query);
      for (const result of searchResults) {
        const existing = candidates.get(result.memory.id);
        if (existing) {
          existing.signals.keyword = result.score;
          existing.matchedSignals.add("keyword");
        } else if (matchesQueryScope(result.memory, query)) {
          // The SearchStore surfaced a memory outside the structural
          // candidate pool (e.g. because the structural fetch was capped).
          // Re-fetch canonical data so content/scoring stay authoritative
          // (docs/ARCHITECTURE.md: secondary stores are never authoritative).
          const canonical = await deps.memoryStore.get(result.memory.id);
          if (!canonical) continue; // stale index entry; canonical was deleted
          candidates.set(canonical.id, {
            memory: canonical,
            signals: {
              keyword: result.score,
              importance: canonical.importance,
              confidence: canonical.confidence,
              recency: recencyScore(canonical.updatedAt, now),
              frequency: frequencyScore(canonical.accessCount),
            },
            matchedSignals: new Set<MatchedSignal>(["keyword"]),
          });
        }
      }
    } else {
      // No SearchStore configured: naive keyword fallback scored directly
      // against canonical content within the already-fetched structural pool.
      for (const candidate of candidates.values()) {
        const score = keywordScore(candidate.memory.content, query.query);
        if (score > 0) {
          candidate.signals.keyword = score;
          candidate.matchedSignals.add("keyword");
        }
      }
    }
  }

  // --- Semantic candidates (Phase 3). Requires both a VectorStore and an
  // EmbeddingProvider; see docs/SEARCH.md and MemoryEngineConfig docs. ---
  if (hasQueryText && deps.vectorStore && deps.embeddingProvider) {
    const queryEmbedding = await deps.embeddingProvider.embed(query.query as string);
    const vectorResults = await deps.vectorStore.search(queryEmbedding, {
      topK: query.limit ? Math.max(query.limit * 5, 50) : 50,
    });
    for (const result of vectorResults) {
      const existing = candidates.get(result.id);
      if (existing) {
        existing.signals.semantic = result.score;
        existing.matchedSignals.add("semantic");
      } else {
        // VectorStore entries carry only an id + opaque metadata, never
        // content — always re-fetch canonical data, and re-validate scope
        // since the vector index may not enforce every filter itself.
        const canonical = await deps.memoryStore.get(result.id);
        if (!canonical || !matchesQueryScope(canonical, query)) continue;
        candidates.set(canonical.id, {
          memory: canonical,
          signals: {
            semantic: result.score,
            importance: canonical.importance,
            confidence: canonical.confidence,
            recency: recencyScore(canonical.updatedAt, now),
            frequency: frequencyScore(canonical.accessCount),
          },
          matchedSignals: new Set<MatchedSignal>(["semantic"]),
        });
      }
    }
  }

  // --- Graph candidates (Phase 5). Requires a GraphStore and query.relatedTo. ---
  if (hasGraphSeed && deps.graphStore && query.relatedTo) {
    const related = await deps.graphStore.getRelated(query.relatedTo, { types: query.relationTypes });
    for (const memory of related) {
      const existing = candidates.get(memory.id);
      if (existing) {
        existing.signals.relationship = 1.0;
        existing.matchedSignals.add("graph");
      } else if (matchesQueryScope(memory, query)) {
        // GraphStore projections are never authoritative (docs/ARCHITECTURE.md)
        // — re-fetch canonical data so content/scoring stay authoritative.
        const canonical = await deps.memoryStore.get(memory.id);
        if (!canonical) continue; // stale relation; canonical was deleted
        candidates.set(canonical.id, {
          memory: canonical,
          signals: {
            relationship: 1.0,
            importance: canonical.importance,
            confidence: canonical.confidence,
            recency: recencyScore(canonical.updatedAt, now),
            frequency: frequencyScore(canonical.accessCount),
          },
          matchedSignals: new Set<MatchedSignal>(["graph"]),
        });
      }
    }
  }

  // --- Merge, dedupe (the Map already guarantees this by id), rank. ---
  const results: SearchResult[] = [...candidates.values()].map((c) => ({
    memory: c.memory,
    score: combineSignals(c.signals, weights),
    matchedSignals: [...c.matchedSignals],
  }));

  results.sort((a, b) => b.score - a.score);

  const offset = query.offset ?? 0;
  const limit = query.limit ?? results.length;
  return results.slice(offset, offset + limit);
}

/**
 * Combines whichever signals are actually available into a [0, 1] score,
 * redistributing weight proportionally across available signals (spec
 * section 26: ranking weights are configurable, not hard-coded, and
 * unavailable signals — e.g. "semantic" with no VectorStore configured —
 * must not silently zero out the whole score).
 *
 * Important distinction: "unavailable" here means unavailable for the
 * *entire search* (e.g. no VectorStore configured at all), not merely
 * absent for one candidate. A signal that's meaningful for this query but
 * happens to be zero for a given candidate (e.g. "keyword"/"semantic"
 * when a query was given but this candidate didn't match) must still be
 * included with value 0 — see the baselines set on every structural
 * candidate in hybridSearch() above — otherwise non-matches would be
 * scored against a smaller weight denominator than matches and could
 * rank *above* them, which would invert relevance instead of reflecting it.
 */
function combineSignals(
  signals: Partial<Record<SignalKey, number>>,
  weights: RankingWeights,
): number {
  const availableKeys = (Object.keys(signals) as SignalKey[]).filter(
    (k) => signals[k] !== undefined,
  );
  if (availableKeys.length === 0) return 0;

  const weightSum = availableKeys.reduce((sum, k) => sum + weights[k], 0);
  if (weightSum === 0) return 0;

  return availableKeys.reduce(
    (sum, k) => sum + (weights[k] / weightSum) * (signals[k] as number),
    0,
  );
}
