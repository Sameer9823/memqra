# Memorie

[![GitHub License](https://img.shields.io/github/license/Sameer9823/samai-sdk)](https://github.com/Sameer9823/memorie/blob/main/LICENSE)
[![Documentation](https://img.shields.io/badge/docs-online-blue)](https://memqra.vercel.app/)
[![CI](https://github.com/Sameer9823/samai-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/Sameer9823/memorie/blob/main/.github/workflows/ci.yml)

**Universal Memory Infrastructure for Modern Software**

Memorie is a reusable memory infrastructure layer — not a chatbot, not an
AI assistant, not a vector-database wrapper. Any application, AI system,
SaaS platform, or knowledge system can use it to store memory that
**evolves, versions, and is traceable over time**, independent of which
database or AI vendor sits underneath it.


## Why Memorie

Most "AI memory" libraries model memory as `text -> embedding -> vector DB
-> similarity search`, with the vector store as the source of truth.
Memorie inverts that: a **canonical memory store** is always authoritative,
and vector/search/graph/cache stores are optional, rebuildable
**projections** of it. This means you can change vector providers, add
search, or lose your cache without ever losing memory. See
`docs/ARCHITECTURE.md`.

## Quick start

```bash
npm install @memorie/core @memorie/storage-memory
```

```ts
import { createMemoryEngine } from "@memorie/core";
import { InMemoryStore, InMemoryVersionStore } from "@memorie/storage-memory";

const memory = createMemoryEngine({
  memoryStore: new InMemoryStore(),
  versionStore: new InMemoryVersionStore(),
});

const m1 = await memory.add({
  namespace: "users",
  subjectId: "user_123",
  type: "preference",
  content: "Prefers TypeScript.",
});

const m2 = await memory.evolve(m1.id, {
  content: "Prefers TypeScript for application development.",
});

const history = await memory.history(m1.id);
// [{ version: 1, snapshot: { content: "Prefers TypeScript." }, ... },
//  { version: 2, snapshot: { content: "Prefers TypeScript for application development." }, ... }]

const asOfYesterday = await memory.getAt(m1.id, new Date(Date.now() - 86_400_000));

const results = await memory.search({
  namespace: "users",
  subjectId: "user_123",
  query: "typescript",
});
```

Real full-text search with `@memorie/search-sqlite` (bm25/FTS5) instead of
the built-in keyword fallback:

```ts
import { SqliteSearchStore } from "@memorie/search-sqlite";

const memory = createMemoryEngine({
  memoryStore: new InMemoryStore(),
  versionStore: new InMemoryVersionStore(),
  searchStore: new SqliteSearchStore(":memory:"),
});
```

Semantic search — a `VectorStore` + `EmbeddingProvider` add a "semantic"
signal to the same `search()` call, no other code changes required:

```ts
import { InMemoryVectorStore } from "@memorie/vector-memory";
import { HashEmbeddingProvider } from "@memorie/embeddings";

const memory = createMemoryEngine({
  memoryStore: new InMemoryStore(),
  versionStore: new InMemoryVersionStore(),
  vectorStore: new InMemoryVectorStore(),
  embeddingProvider: new HashEmbeddingProvider(), // swap in a real embedding model for production
});
```

Local-first with SQLite:

```ts
import { createMemoryEngine } from "@memorie/core";
import { SqliteStore, SqliteVersionStore } from "@memorie/storage-sqlite";

const store = new SqliteStore("./memorie.db");
const memory = createMemoryEngine({
  memoryStore: store,
  versionStore: new SqliteVersionStore(store.raw),
});
```

More runnable examples live in `examples/`.

## Packages (this repo)

| Package | Purpose |
|---|---|
| `@memorie/types` | Core data model, typed errors, events. Zero runtime dependencies. |
| `@memorie/storage` | Capability interfaces (`MemoryStore`, `VersionStore`, `VectorStore`, `SearchStore`, `GraphStore`, `CacheStore`, `BlobStore`, `ProvenanceStore`) + adapter contract test suites. |
| `@memorie/storage-memory` | In-memory `MemoryStore`/`VersionStore`/`CacheStore`/`ConflictStore`/`GraphStore`. For tests and prototyping. |
| `@memorie/storage-sqlite` | SQLite `MemoryStore`/`VersionStore` via `better-sqlite3`. Local-first, single-node. |
| `@memorie/storage-postgres` | PostgreSQL `MemoryStore`/`VersionStore`/`ConflictStore` via `pg`. Real transactions (`BEGIN`/`COMMIT`/`ROLLBACK`). |
| `@memorie/storage-security` | `EncryptedMemoryStore` + `AesGcmCipher`: a `MemoryStore` decorator for transparent encryption-at-rest, composable with any adapter above. |
| `@memorie/cache-redis` | Redis-backed `CacheStore` via `redis` (node-redis). Real cache-aside layer, not a stub. |
| `@memorie/search-sqlite` | SQLite FTS5-backed `SearchStore` (bm25 ranking, Porter stemming). Real full-text search, not a stub. |
| `@memorie/vector-memory` | Brute-force, in-process cosine-similarity `VectorStore`. Real math; fine for tests/demos/small datasets. |
| `@memorie/embeddings` | `HashEmbeddingProvider`: a deterministic, dependency-free embedding for exercising the vector path with zero AI vendor dependency. |
| `@memorie/core` | The `MemoryEngine` orchestration layer: CRUD, lifecycle, versioning/time-travel, hybrid search, ingest/conflict pipeline, graph relationships, observability, security, maintenance. |

Not yet in this repo: MongoDB/MySQL/S3/Elasticsearch (storage/search),
real vector-database adapters (Qdrant et al.), a real graph-database
adapter (Neo4j et al.) — see "Roadmap" below and `docs/ADAPTERS.md` for
why and what a contributor would need to add one.

## Core concepts

- **Identity vs. state vs. version.** A `Memory` has a stable `id`
  (identity) that persists across an evolving `content`/`state`
  (current state) while every change is preserved as an immutable
  `MemoryVersion` (history). See `docs/MEMORY-EVOLUTION.md`.
- **Lifecycle.** Memories move through an explicit state machine
  (`active -> updated -> archived/expired/superseded/merged -> deleted`).
  Invalid transitions throw `InvalidStateTransitionError` rather than
  silently succeeding. See `docs/MEMORY-LIFECYCLE.md`.
- **Namespaces & subjects, not users & chats.** Nothing in the core
  model assumes a chatbot. `subjectId` can be a user, a project, a
  device, a document — whatever your application needs it to mean.
- **Graceful degradation.** With zero optional adapters configured,
  `engine.search()` still works (structured filters + a naive keyword
  score over canonical content). Configuring a `SearchStore`/`VectorStore`
  upgrades relevance without changing the call site.

## Development

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
```

All four commands are expected to be green — `npm test` runs the full
suite (contract tests for every `MemoryStore`/`SearchStore`/
`VectorStore`/`CacheStore`/`ConflictStore`/`GraphStore` implementation
against the shared suites in `@memorie/storage/contract-tests`, plus the
`MemoryEngine` orchestration tests) across every package under
`packages/*/test`. The PostgreSQL and Redis adapters' tests need a live
local instance to run against (see `.github/workflows/ci.yml` for how
CI provisions them as service containers) and are skipped otherwise —
check each adapter's test file for how it detects that.

## Documentation

| Doc | Covers |
|---|---|
| `docs/ARCHITECTURE.md` | Full target architecture and the canonical-store-plus-projections model. |
| `docs/MEMORY-EVOLUTION.md` | Identity vs. state vs. version; the ingest → identity-resolution → duplicate/conflict-detection pipeline. |
| `docs/MEMORY-LIFECYCLE.md` | The memory state machine and valid transitions. |
| `docs/SEARCH.md` | The hybrid search pipeline (structured + keyword + semantic + relationship) and ranking. |
| `docs/GRAPH.md` | Typed memory relationships and multi-hop traversal. |
| `docs/ADAPTERS.md` | The capability-interface model, every adapter implemented here, how to write and contract-test your own, and what's not built yet (and why). |
| `docs/OBSERVABILITY.md` | `Logger`/`MetricsProvider`/`Tracer` hooks — what's tracked and how to plug in a provider. |
| `docs/SECURITY.md` | Tenant isolation, authorization hooks, the `redact` hook, and encryption-at-rest. |
| `docs/MAINTENANCE.md` | `reindex()`/`reconcile()`/`export()`/`import()` for backup, restore, and repairing drifted projections. |
| `docs/BENCHMARKS.md` | How `scripts/benchmark.mjs` measures p50/p95/p99 operation latency, and how to point it at a real adapter. |

## Roadmap

Implemented in this repo today, per `docs/ARCHITECTURE.md`:

- **Phase 1 — Core:** CRUD, namespaces/subjects/multi-tenancy, lifecycle,
  versioning, history, time-travel (`getAt`), events, validation,
  InMemory + SQLite adapters, adapter contract tests.
- **Phase 2 — Retrieval:** the hybrid search pipeline (`docs/SEARCH.md`)
  — structured filtering, a keyword fallback with zero adapters
  configured, and a real FTS5/bm25 `SearchStore` (`@memorie/search-sqlite`)
  with its own contract test suite. Configurable ranking weights.
- **Phase 3 — Vector:** `EmbeddingProvider`/`VectorStore` interfaces, a
  brute-force reference `VectorStore` (`@memorie/vector-memory`) with its
  own contract test suite, a dependency-free `EmbeddingProvider`
  (`@memorie/embeddings`) for testing/demos, and a "semantic" signal
  merged into the same hybrid pipeline — with scope/tenant re-validation
  for any secondary-index hit outside the canonical candidate pool.
- **Phase 4 — Evolution:** `engine.ingest()` runs incoming information
  through identity resolution → duplicate detection → conflict
  detection → update, all pluggable (`docs/MEMORY-EVOLUTION.md`).
  Ships with honest, non-AI defaults (explicit `metadata.key` identity
  matching, normalized-text duplicate detection) and full conflict
  detection/resolution/consolidation when a `MemoryIntelligenceProvider`
  is configured. `ConflictStore` (with `@memorie/storage-memory`'s
  `InMemoryConflictStore`) persists open conflicts;
  `resolveConflict()` applies `latest`/`supersede`/`highest-confidence`/
  `highest-importance`/`merge`/`manual` strategies; `consolidate()` folds
  memories directly.
- **Phase 5 — Graph:** `GraphStore` interface with contract tests and a
  reference `InMemoryGraphStore` (`@memorie/storage-memory`).
  `engine.relate()`/`related()`/`unrelate()`/`traverse()` for typed,
  directed relationships and multi-hop traversal
  (`docs/GRAPH.md`). `search({ relatedTo })` feeds a `"relationship"`
  signal into the same hybrid ranking pipeline as keyword/semantic. The
  evolution pipeline (Phase 4) automatically records
  `contradicts`/`supersedes`/`derived_from` relations as a side effect
  when both a `ConflictStore` and `GraphStore` are configured.
- **Phase 6 — Infrastructure (started):** `@memorie/storage-postgres`
  (`MemoryStore`/`VersionStore`/`ConflictStore`, with real
  `BEGIN`/`COMMIT`/`ROLLBACK` transactions) and `@memorie/cache-redis`
  (`CacheStore`), both verified against live local PostgreSQL 16 /
  Redis 7 instances, not just typechecked. `engine.get()` now does real
  cache-aside reads through a configured `CacheStore`, invalidating on
  every write (`docs/ADAPTERS.md`). See `examples/11-postgres-redis`.
- **Phase 7 — Production:** provider-independent
  `Logger`/`MetricsProvider`/`Tracer` hooks (`docs/OBSERVABILITY.md`)
  tracking creation/update/delete rates, get/search latency, cache
  hit/miss, and a `memorie.<operation>` span per call (`add`/`get`/
  `update`/`delete`/`search`/`ingest`/`resolveConflict`/`consolidate`) —
  never logging memory content. `authorizeRead`/`authorizeWrite`/
  `authorizeDelete` hooks and a `redact` hook (`docs/SECURITY.md`),
  checked/applied before and after any store access respectively.
  `@memorie/storage-security`'s `EncryptedMemoryStore` +
  `AesGcmCipher` for transparent encryption-at-rest, composable with
  any `MemoryStore` adapter above. `reindex()`/`reconcile()` (with
  optional repair) and `export()`/`import()` for backup/restore
  (`docs/MAINTENANCE.md`). `scripts/benchmark.mjs` tracks p50/p95/p99
  latency per operation (`docs/BENCHMARKS.md`, `npm run benchmark`).
  CI now runs the full suite — including the live PostgreSQL/Redis
  integration tests — against real Postgres/Redis service containers
  (`.github/workflows/ci.yml`).

**Not yet implemented** (by design — these are separate phases, not
missing features hidden behind fake adapters):

- **Phase 6 — Infrastructure (remaining):** MongoDB, MySQL, S3, Elasticsearch/OpenSearch, real vector-database adapters (Qdrant et al.), and a real GraphStore adapter (Neo4j et al.). MongoDB in particular isn't installable via this environment's available package sources — see `docs/ADAPTERS.md` for why.

That's every item from the original design brief's Phase 1-7 scope
except the Phase 6 adapters above, which this sandbox cannot install
(see `docs/ADAPTERS.md`).

See `docs/ARCHITECTURE.md` for the full target architecture.

## Contributing

See `CONTRIBUTING.md` — in short: implement an interface from
`@memorie/storage` or `@memorie/types`, verify it against the matching
contract-test suite, and it belongs here. See `CHANGELOG.md` for
what's shipped so far, and `PUBLISHING.md` if you're the one cutting a
release.

## License

MIT (see `LICENSE`).
