# API Reference (Phases 1–6)

This covers the public API surface implemented today — which is
adapter-agnostic: everything here works the same whether `memoryStore`
is `InMemoryStore`, `SqliteStore`, or `PostgresStore` (see
`docs/ADAPTERS.md`). See `README.md` "Roadmap" for what's designed but
not yet built.

## `createMemoryEngine(config)`

```ts
import { createMemoryEngine } from "@memorie/core";

const memory = createMemoryEngine({
  memoryStore,               // required: MemoryStore
  versionStore,              // optional: VersionStore (defaults to a no-op NullVersionStore)
  searchStore,                // optional: SearchStore
  vectorStore,                 // optional: VectorStore
  embeddingProvider,             // optional: EmbeddingProvider — needed alongside vectorStore for the "semantic" search signal
  graphStore,                      // optional: GraphStore
  cacheStore,                        // optional: CacheStore
  provenanceStore,                     // optional: ProvenanceStore
  conflictStore,                         // optional: ConflictStore — required for ingest()'s "conflict" outcome and resolveConflict()
  ranking,                               // optional: Partial<RankingWeights>
  evolution,                             // optional: EvolutionConfig — see docs/MEMORY-EVOLUTION.md
  idGenerator,                             // optional: () => string, defaults to crypto.randomUUID()
  clock,                                     // optional: () => Date, defaults to () => new Date()
});
```

Returns a `MemoryEngine`. When both `vectorStore` and `embeddingProvider`
are configured, `add()`/`update()` automatically embed `content` and
upsert into the vector store, and `search()` automatically embeds the
query text — see `docs/SEARCH.md`.

## `MemoryEngine`

### CRUD

- `add(input: NewMemoryInput): Promise<Memory>` — creates a memory.
  Validates `namespace`/`subjectId`/`type`/`content` are non-empty and
  `importance`/`confidence` (if given) are in `[0, 1]`. Defaults
  `importance`/`confidence` to `0.5`, `state` to `"active"`, `version` to
  `1`. Records a `"created"` version and emits `memory.created`.
- `remember(input)` — alias for `add()`.
- `get(id: string): Promise<Memory | null>` — fetch without side effects.
- `recall(id: string): Promise<Memory | null>` — fetch *and* record
  access (`lastAccessedAt`, `accessCount++`), emits `memory.accessed`.
- `update(id, patch, options?): Promise<Memory>` — validates the patch,
  checks the lifecycle transition if `patch.state` is set, applies it
  (optionally with `options.expectedVersion` for optimistic concurrency —
  throws `VersionConflictError` on mismatch), bumps `version`, records a
  version snapshot, emits `memory.updated`.
- `evolve(id, patch, options?)` — alias for `update()`. The primitive
  `ingest()` is built on. See `docs/MEMORY-EVOLUTION.md`.
- `delete(id: string): Promise<void>` — removes the memory, its version
  history, and its search/vector index entries (if configured). Emits
  `memory.deleted`.
- `list(options?: ListOptions): Promise<Memory[]>`
- `count(options?: CountOptions): Promise<number>`

### Retrieval

- `search(query: SearchQuery): Promise<SearchResult[]>` — runs the hybrid
  retrieval pipeline (`docs/SEARCH.md`): structured filtering always
  applies; keyword relevance comes from the configured `SearchStore` if
  present, otherwise a built-in fallback scored against canonical
  content. Always works, zero adapters required (see
  `docs/ARCHITECTURE.md`, "graceful degradation").

### Versioning / time travel

- `history(memoryId): Promise<MemoryVersion[]>` / `versions(memoryId)` —
  all recorded versions, oldest first.
- `getVersion(memoryId, version): Promise<MemoryVersion | null>`
- `getAt(memoryId, timestamp: Date): Promise<Memory | null>` — the
  memory as it looked at that point in time, or `null` if it didn't
  exist yet.

### Relationships (Phase 5)

See `docs/GRAPH.md` for full details. All require a `GraphStore`; throw
`UnsupportedCapabilityError` otherwise.

- `relate(fromMemoryId, toMemoryId, type, options?): Promise<MemoryRelation>` —
  creates a typed, directed relation (`options.weight`, `options.metadata`).
  Emits `memory.relation_created`.
- `related(memoryId, options?): Promise<Memory[]>` — one-hop lookup
  (`direction`, `types`, `minWeight`, `limit`).
- `traverse(memoryId, options?): Promise<Memory[]>` — multi-hop lookup
  (same options plus `maxDepth`).
- `unrelate(relationId): Promise<void>` — deletes a relation. Emits
  `memory.relation_deleted`.

`search({ relatedTo, relationTypes })` feeds a `"relationship"` signal
into the same hybrid ranking pipeline used by keyword/semantic search.

### Evolution (Phase 4)

See `docs/MEMORY-EVOLUTION.md` for full details.

- `ingest(input: NewMemoryInput): Promise<IngestResult>` — runs the
  identity-resolution → duplicate/conflict-detection pipeline and
  returns `{ outcome: "created" | "updated" | "duplicate" | "conflict",
  memory, previous?, skipped?, conflict?, identityMatch? }`.
- `resolveConflict(conflictId, strategy?): Promise<ConflictResolutionResult>` —
  applies a `ConflictResolutionStrategy` (`"latest"`, `"supersede"`,
  `"highest-confidence"`, `"highest-importance"`, `"merge"`, `"manual"`)
  to an open conflict recorded by `ingest()`. Requires `conflictStore`;
  throws `UnsupportedCapabilityError` otherwise.
- `consolidate(memoryIds: string[]): Promise<Memory>` — folds several
  memories into one via `evolution.intelligenceProvider.consolidate()`.
  Requires an `intelligenceProvider`; throws `UnsupportedCapabilityError`
  otherwise.

### Forgetting

- `forget(options: ForgetOptions): Promise<number>` — deletes a single
  memory by `id`, or every memory matching a
  `{ tenantId?, namespace?, subjectId?, type? }` scope. Returns the
  number deleted.

### Maintenance (Phase 7)

See `docs/MAINTENANCE.md` for full details.

- `reindex(options?: ReindexOptions): Promise<ReindexReport>` — rebuilds
  `SearchStore`/`VectorStore` projections from canonical data.
- `reconcile(options?: ReconcileOptions): Promise<ReconciliationReport>` —
  detects (and, with `{ repair: true }`, fixes) drift between canonical
  data and `SearchStore`/`VectorStore` projections that implement the
  optional `listIds()` method.
- `export(options?: ExportOptions): Promise<MemoryExport>` /
  `import(data: MemoryExport, options?: ImportOptions): Promise<ImportResult>` —
  JSON-shaped backup/restore, optionally including versions, relations,
  and conflicts.

### Observability & security (Phase 7)

See `docs/OBSERVABILITY.md` and `docs/SECURITY.md`. Configured via
`MemoryEngineConfig.observability` (`logger`, `metrics`) and
`.security` (`authorizeRead`, `authorizeWrite`, `authorizeDelete`) — all
independently optional, no-ops when omitted.

### Introspection

- `capabilities(): EngineCapabilities` — which optional capabilities are
  actually configured (`vector`, `graph`, `cache`, `versioning`,
  `provenance`, `transactions`, `conflictResolution`; `memory` and
  `search` are always `true`).
- `events` — a `MemorieEventEmitter`. `engine.events.on("memory.updated", handler)`.
  See `packages/types/src/events.ts` for the full event map.

## Errors

All errors extend `MemorieError` (`.code`, optional `.details`, preserves
`.cause`). See `packages/types/src/errors.ts`:
`MemoryNotFoundError`, `MemoryConflictError`, `StorageError`,
`SearchError`, `VectorStoreError`, `GraphStoreError`, `ValidationError`,
`TenantIsolationError`, `ConcurrencyError`, `VersionConflictError`,
`UnsupportedCapabilityError`, `InvalidStateTransitionError`.
