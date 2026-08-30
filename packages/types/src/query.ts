/** Range filter for numeric/date fields. All bounds are inclusive unless noted. */
export interface RangeFilter<T> {
  eq?: T;
  gte?: T;
  gt?: T;
  lte?: T;
  lt?: T;
}

export interface MemoryFilters {
  type?: string | string[];
  state?: string | string[];
  importance?: RangeFilter<number>;
  confidence?: RangeFilter<number>;
  createdAt?: RangeFilter<Date>;
  updatedAt?: RangeFilter<Date>;
  /** Exact-match filters against top-level metadata keys. Adapters may support more (e.g. JSON path). */
  metadata?: Record<string, unknown>;
}

export interface MemoryScope {
  tenantId?: string;
  namespace?: string;
  subjectId?: string;
}

export interface ListOptions extends MemoryScope {
  filters?: MemoryFilters;
  limit?: number;
  offset?: number;
  cursor?: string;
  orderBy?: "createdAt" | "updatedAt" | "importance" | "confidence";
  orderDirection?: "asc" | "desc";
}

export interface CountOptions extends MemoryScope {
  filters?: MemoryFilters;
}

/**
 * A search query. `query` (free text) is optional: a filters-only query
 * against structured fields must work without any text/semantic search
 * backend configured (see docs/ARCHITECTURE.md, "graceful degradation").
 */
export interface SearchQuery extends MemoryScope {
  query?: string;
  filters?: MemoryFilters;
  limit?: number;
  offset?: number;
  /**
   * Optional graph-retrieval seed (spec section 25/27): when set alongside
   * a configured GraphStore, memories related to `relatedTo` contribute a
   * "relationship" ranking signal on top of keyword/semantic/structured
   * signals. Has no effect without a GraphStore configured.
   */
  relatedTo?: string;
  /** Restricts which relation types feed the "relationship" signal when `relatedTo` is set. */
  relationTypes?: import("./relations.js").RelationType[];
}

export interface SearchResult {
  memory: import("./memory.js").Memory;
  /** Relevance score in [0, 1]. Meaning depends on which retrieval path produced it. */
  score: number;
  /** Which signals contributed to the score, for debuggability. */
  matchedSignals?: Array<"keyword" | "semantic" | "graph" | "structured">;
}

export interface VectorSearchOptions {
  topK?: number;
  threshold?: number;
  filter?: Record<string, unknown>;
}

export interface VectorSearchResult {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface RankingWeights {
  semantic: number;
  keyword: number;
  importance: number;
  confidence: number;
  recency: number;
  relationship: number;
  frequency: number;
}

export const DEFAULT_RANKING_WEIGHTS: RankingWeights = {
  semantic: 0.4,
  keyword: 0.15,
  importance: 0.15,
  confidence: 0.1,
  recency: 0.1,
  relationship: 0.05,
  frequency: 0.05,
};
