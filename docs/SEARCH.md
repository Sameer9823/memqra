# Search

## `engine.search(query)`

```ts
await memory.search({
  tenantId: "tenant_123",       // optional
  namespace: "projects",
  subjectId: "project_42",
  query: "architecture",         // optional free text
  filters: {
    type: "fact",
    importance: { gte: 0.7 },
    confidence: { gte: 0.8 },
  },
  limit: 10,
});
```

Returns `SearchResult[]`, each `{ memory, score, matchedSignals }` sorted
by `score` descending. `score` is in `[0, 1]`. `matchedSignals` tells you
which retrieval paths contributed (`"structured"`, `"keyword"`, and in
later phases `"semantic"`/`"graph"`).

Structured filters (`filters`, `tenantId`/`namespace`/`subjectId`) always
apply regardless of whether `query` (free text) is given — you can call
`search()` with only filters to get a scored, ranked list of everything
matching a scope (spec section 24).

## The hybrid pipeline

Implemented in `packages/core/src/hybrid-search.ts`, matching the
pipeline shape from spec section 25:

```
Query
 |
Structured candidates (always, from canonical MemoryStore)
 |
Keyword candidates (SearchStore if configured, else naive fallback)
 |
Semantic candidates (VectorStore + EmbeddingProvider, if both configured)
 |
[Graph candidates — Phase 5]
 |
Merge (by memory id) + deduplicate
 |
Rank (weighted combination of available signals)
 |
Return
```

**Structured candidates** are always fetched from the canonical
`MemoryStore` — this is what guarantees `search()` never returns nothing
just because no optional adapter is configured. Each carries
`importance`, `confidence`, `recency` (exponential decay, 30-day half
life), and `frequency` (log-scaled access count) signals computed
directly from canonical data.

**Keyword candidates**: if a `SearchStore` is configured (e.g.
`@memorie/search-sqlite`, an FTS5/bm25-backed adapter), its results are
merged in by id, contributing a real relevance `keyword` signal. If a
memory the SearchStore found isn't in the structural candidate pool
(possible if the structural fetch was capped by `limit`), its canonical
record is re-fetched — search-index data is never treated as
authoritative content (see `docs/ARCHITECTURE.md`).

Without a `SearchStore`, keyword scoring falls back to a small
substring-match heuristic (`packages/core/src/keyword-search.ts`) run
directly against canonical `content`. It's not as good as real full-text
search, but it means `search()` always works.

**Semantic candidates**: if both a `VectorStore` and an `EmbeddingProvider`
are configured on the engine, the query text is embedded and
`vectorStore.search()` results are merged in the same way as keyword
results, contributing a `semantic` signal. Both must be present —
`engine.add()`/`engine.update()` embed content and call
`vectorStore.upsert()` automatically when both are configured, and
`engine.search()` embeds the query text the same way. A `VectorStore`
alone (no `EmbeddingProvider`) is still usable for direct vector storage,
just not through `engine.search()`'s text-query API.

Any candidate a `SearchStore`/`VectorStore` surfaces from outside the
structural pool is re-validated against the query's `tenantId`/
`namespace`/`subjectId`/`filters` before being included — secondary
indexes are never trusted to enforce isolation on the core's behalf (see
`docs/SECURITY.md`).

## Ranking weights

```ts
const memory = createMemoryEngine({
  memoryStore,
  ranking: {
    semantic: 0.40,
    keyword: 0.15,
    importance: 0.15,
    confidence: 0.10,
    recency: 0.10,
    relationship: 0.05,
    frequency: 0.05,
  },
});
```

Unset keys fall back to `DEFAULT_RANKING_WEIGHTS` (`@memorie/types`).
Weights are proportionally redistributed across whichever signal
*categories* are available for the whole search (e.g. `semantic` drops
out entirely with no `VectorStore` configured, and its weight share is
redistributed across the rest) — see `combineSignals()` in
`hybrid-search.ts` for the exact algorithm and an important subtlety:
a signal that's meaningful for the query but zero for one particular
candidate (e.g. `keyword` when free text was given but this candidate
didn't match) is included as `0`, not dropped — dropping it would
under-penalize non-matches relative to matches and invert ranking. This
was caught and fixed via `packages/core/test/hybrid-search.test.ts`.

## SearchStore adapters

| Package | Backend | Notes |
|---|---|---|
| `@memorie/search-sqlite` | SQLite FTS5 (Porter stemming, bm25 ranking) | Real full-text search, not a stub. `SqliteSearchStore` is a projection: its FTS index can be fully rebuilt by re-calling `index()` for every canonical memory. |

## VectorStore + EmbeddingProvider adapters

| Package | What it is | Notes |
|---|---|---|
| `@memorie/vector-memory` | `InMemoryVectorStore` | Brute-force O(n) cosine-similarity search. Fine for tests/demos/small datasets; not for large corpora — that needs a real vector database adapter (Qdrant, etc., not yet built). |
| `@memorie/embeddings` | `HashEmbeddingProvider` | A deterministic, dependency-free hashing-trick bag-of-words embedding. Captures lexical overlap, not semantic meaning — it exists to make the vector-search code path exercisable and testable with zero AI vendor dependency and zero network calls. Swap in a real embedding-model-backed `EmbeddingProvider` for production semantic quality. |

Write your own by implementing `SearchStore`/`VectorStore`
(`@memorie/storage`) and verifying it against
`runSearchStoreContractTests`/`runVectorStoreContractTests` — see
`packages/search-sqlite/test/sqlite-search-store.test.ts` and
`packages/vector-memory/test/in-memory-vector-store.test.ts` for the
pattern, and `docs/ADAPTERS.md`.

## Not yet implemented

- Elasticsearch/OpenSearch adapters (spec section 24's other named
  backends) — the interface is defined and any adapter that implements
  it and passes the contract suite can be dropped in.
- Real vector-database adapters (Qdrant, Weaviate, Pinecone, Milvus,
  LanceDB) — `InMemoryVectorStore` is brute-force and in-process only.
- A production-grade `EmbeddingProvider` backed by an actual embedding
  model — `HashEmbeddingProvider` is a deterministic offline stand-in for
  testing/demos, not a semantic embedding.
- Graph (`GraphStore`) signal in the hybrid pipeline — Phase 5. The
  pipeline is already structured so adding it is additive (a new
  candidate source feeding the same merge/rank stage), not a rewrite.
