import type {
  SearchQuery,
  SearchResult,
  VectorSearchOptions,
  VectorSearchResult,
  Memory,
  MemoryRelation,
  GraphQueryOptions,
  TraversalOptions,
} from "@memorie/types";

/**
 * Optional projection. Never authoritative — see docs/ARCHITECTURE.md.
 *
 * Score contract: `search()` results must be scored in [0, 1], where 1.0
 * means "identical direction" (e.g. cosine similarity 1.0), so scores
 * compose predictably with other [0, 1] signals in the core hybrid
 * search pipeline (docs/SEARCH.md). Adapters using a distance metric
 * (Euclidean, dot product) must normalize into this range.
 */
export interface VectorStore {
  upsert(
    id: string,
    embedding: number[],
    metadata?: Record<string, unknown>,
  ): Promise<void>;

  search(
    embedding: number[],
    options?: VectorSearchOptions,
  ): Promise<VectorSearchResult[]>;

  delete(id: string): Promise<void>;

  /**
   * Optional. Lists every memory id currently indexed. Enables
   * `engine.reconcile()` to detect drift against this store (missing
   * entries, or orphans left behind after a memory was deleted outside
   * the engine). Adapters that can't cheaply enumerate their keys may
   * omit this — reconcile() simply skips the "vector" store when it's
   * absent, rather than faking a result.
   */
  listIds?(): Promise<string[]>;
}

/** Optional projection for keyword/full-text search. */
export interface SearchStore {
  index(memory: Memory): Promise<void>;
  search(query: SearchQuery): Promise<SearchResult[]>;
  delete(id: string): Promise<void>;

  /** Optional. See `VectorStore.listIds()` — same purpose, for the search index. */
  listIds?(): Promise<string[]>;
}

/** Optional projection for relationship/graph queries. */
export interface GraphStore {
  createRelation(relation: MemoryRelation): Promise<void>;
  deleteRelation(relationId: string): Promise<void>;
  getRelated(memoryId: string, options?: GraphQueryOptions): Promise<Memory[]>;
  traverse(memoryId: string, options?: TraversalOptions): Promise<Memory[]>;

  /**
   * Optional. Lists every relation record. Enables `engine.export()` to
   * include relations, since `getRelated`/`traverse` only return the
   * endpoint `Memory` objects, not the relation records themselves
   * (id/type/weight/metadata). Adapters that can't cheaply enumerate
   * relations may omit this — export() simply omits `relations` from
   * its output when it's absent, rather than faking a result.
   */
  listRelations?(): Promise<MemoryRelation[]>;
}

/** Optional read-through/write-through cache. Must never be authoritative. */
export interface CacheStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, options?: { ttlMs?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

export interface BlobStore {
  put(
    key: string,
    data: Uint8Array,
    metadata?: Record<string, unknown>,
  ): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
