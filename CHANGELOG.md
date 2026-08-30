# Changelog

All notable changes to this project are documented here, grouped by
the phase of the original design brief they implement (see
`README.md`'s "Roadmap" and `docs/ARCHITECTURE.md`). This project has
not yet had a tagged npm release — everything below is `0.1.0` /
unreleased.

## [Unreleased]

### Stabilization pass

- Fixed `npm ci` failure: `package-lock.json` was missing the
  `@memorie/storage-security` workspace entries (a real, already-
  implemented package, not a stale reference). Resynced via
  `npm install --package-lock-only`; no source changes.
- Verified end-to-end from a clean install: `npm ci`, `npm run lint`,
  `npm run typecheck`, `npm test` (197/197 tests across 26 files,
  including `@memorie/storage-postgres`/`@memorie/cache-redis` against
  live local PostgreSQL 16/Redis 7), and `npm run build` (all 11
  packages). Confirmed `npm pack --dry-run` output for every package
  ships only `dist/` + `package.json` + declared `files`.

### Phase 7 — Production

- **Tracing.** `Tracer`/`Span` interfaces in `@memorie/types`, wired
  into `MemoryEngine` as `observability.tracer`. A `memorie.<operation>`
  span around `add`/`get`/`update`/`delete`/`search`/`ingest`/
  `resolveConflict`/`consolidate`, with scope/result attributes,
  exception recording, and a no-op `Span` when no tracer is configured.
  See `docs/OBSERVABILITY.md`.
- **Redaction.** `RedactFn`/`RedactionContext` in `@memorie/types`,
  wired into `MemoryEngine` as `security.redact`. Applied to every
  memory leaving `get()`/`recall()`/`list()`/`search()`/`export()`
  after authorization passes. See `docs/SECURITY.md`.
- **Encryption at rest.** New `@memorie/storage-security` package:
  `AesGcmCipher` (AES-256-GCM via `node:crypto` only, no external
  dependency) and `EncryptedMemoryStore` (a `MemoryStore` decorator
  that transparently encrypts `content` before it reaches any wrapped
  adapter). Verified against the shared `runMemoryStoreContractTests`
  suite. See `docs/SECURITY.md` and `docs/ADAPTERS.md`.
- **Benchmarks.** `scripts/benchmark.mjs` (`npm run benchmark`) tracks
  p50/p95/p99/mean/max latency per `MemoryEngine` operation. See
  `docs/BENCHMARKS.md`.
- (Earlier in Phase 7, already shipped before this changelog started
  tracking individually:) `Logger`/`MetricsProvider` observability
  hooks; `authorizeRead`/`authorizeWrite`/`authorizeDelete` hooks;
  `reindex()`/`reconcile()` with optional repair; `export()`/
  `import()` for backup/restore; CI running the full suite against
  live PostgreSQL/Redis service containers.

### Phase 6 — Infrastructure

- `@memorie/storage-postgres`: real `pg`-backed `MemoryStore`/
  `VersionStore`/`ConflictStore`, with genuine `BEGIN`/`COMMIT`/
  `ROLLBACK` transactions. Verified against a live local PostgreSQL 16
  instance.
- `@memorie/cache-redis`: real `redis` (node-redis)-backed `CacheStore`.
  Verified against a live local Redis 7 instance.
- Not yet implemented: MongoDB, MySQL, S3 (storage/blob);
  Elasticsearch/OpenSearch (search); real vector-database adapters
  (Qdrant et al.); a real graph-database adapter (Neo4j et al.). See
  `docs/ADAPTERS.md` for why these aren't stubbed in rather than left
  out, and what's needed to add one.

### Phase 5 — Graph

- Typed `MemoryRelation`s with multi-hop traversal
  (`GraphQueryOptions`/`TraversalOptions`), an in-memory
  `InMemoryGraphStore` reference implementation, and `search({
  relatedTo })` feeding a `"relationship"` ranking signal. See
  `docs/GRAPH.md`.

### Phase 4 — Evolution

- The ingest pipeline: identity resolution → duplicate detection →
  conflict detection → update-or-conflict, with pluggable strategies
  and a `ConflictStore` for recording/resolving detected conflicts.
  See `docs/MEMORY-EVOLUTION.md`.

### Phase 3 — Vector

- `VectorStore` capability interface, `@memorie/vector-memory`
  (brute-force in-process cosine similarity — real math, not a stub),
  and `@memorie/embeddings`' `HashEmbeddingProvider` for exercising the
  vector path without an AI vendor dependency.

### Phase 2 — Retrieval

- The hybrid search pipeline (structured + keyword + semantic +
  relationship signals), `SearchStore` capability interface, and
  `@memorie/search-sqlite` (real SQLite FTS5 full-text search with bm25
  ranking). See `docs/SEARCH.md`.

### Phase 1 — Core

- The canonical `Memory`/`MemoryVersion` data model, `MemoryEngine`
  CRUD, the lifecycle state machine, `@memorie/storage-memory` and
  `@memorie/storage-sqlite` as the first `MemoryStore`/`VersionStore`
  adapters, and the capability-interface architecture itself (see
  "Why Memorie" in `README.md`).
