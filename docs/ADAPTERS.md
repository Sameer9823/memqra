# Adapters

## Capability model

Memorie doesn't have one monolithic "storage adapter" interface. Each
concern is its own interface in `@memorie/storage`:

- `MemoryStore` (required — the canonical store)
- `VersionStore`, `ProvenanceStore`, `ConflictStore`
- `VectorStore`, `SearchStore`, `GraphStore`, `CacheStore`, `BlobStore`

A single adapter package may implement one or several. Nothing requires
implementing all of them.

## Implemented in this repo

| Package | Implements | Notes |
|---|---|---|
| `@memorie/storage-memory` | `MemoryStore`, `VersionStore`, `CacheStore`, `ConflictStore`, `GraphStore` | Non-persistent. Tests/prototyping. `InMemoryGraphStore` resolves full `Memory` objects via an injected lookup (e.g. `memoryStore.get`) rather than holding its own copies — see `docs/GRAPH.md`. |
| `@memorie/storage-sqlite` | `MemoryStore`, `VersionStore` | `better-sqlite3`-backed. `SqliteStore.transaction()` currently runs the callback without a native SQLite transaction wrapper (documented limitation — see the class docstring); true nested-rollback semantics are Phase 7 work. |
| `@memorie/storage-postgres` | `MemoryStore`, `VersionStore`, `ConflictStore` | Real `pg`-backed adapter. `PostgresStore.transaction()` uses genuine `BEGIN`/`COMMIT`/`ROLLBACK` on a checked-out `PoolClient` — true nested-rollback semantics, unlike the SQLite adapter above. Call `await store.init()` once (idempotent `CREATE TABLE IF NOT EXISTS`) before use. Verified against a live local PostgreSQL 16 instance, not just typechecked. |
| `@memorie/cache-redis` | `CacheStore` | Real `redis` (node-redis)-backed adapter. JSON-serializes values; `clear()` only deletes keys under its own `keyPrefix` (default `memorie:cache:`) rather than `FLUSHDB`-ing a database that might be shared with other applications. Verified against a live local Redis 7 instance. |
| `@memorie/search-sqlite` | `SearchStore` | SQLite FTS5-backed full-text search (Porter stemming, bm25 ranking). A real projection: rebuildable from canonical data via `index()`. See `docs/SEARCH.md`. |
| `@memorie/vector-memory` | `VectorStore` | Brute-force, in-process cosine-similarity search. Real math, not a stub; O(n) per query so intended for tests/demos/small datasets, not large corpora. |
| `@memorie/embeddings` | `EmbeddingProvider` | `HashEmbeddingProvider`: deterministic, dependency-free hashing-trick embedding. Captures lexical overlap, not semantic meaning — see `docs/SEARCH.md` for why. |
| `@memorie/storage-security` | `MemoryStore` decorator | `EncryptedMemoryStore` wraps any `MemoryStore` to transparently encrypt `content` at rest with `AesGcmCipher` (AES-256-GCM, `node:crypto` only, no external dependency). Not itself a backend — it composes with any adapter above, e.g. `new EncryptedMemoryStore(new PostgresStore(pool), { cipher })`. Verified against `runMemoryStoreContractTests` like every other `MemoryStore` in this table. See `docs/SECURITY.md`. |

The engine wires `CacheStore` in as a real cache-aside layer, not just a
configuration flag: `engine.get()` checks the cache before the canonical
`MemoryStore` and populates it on a miss; `update()`/`delete()`/every
evolution-pipeline write invalidates the corresponding entry rather than
ever writing a possibly-stale value back into the cache (see
`packages/core/test/cache.test.ts`, and "Never allow stale cache state
to overwrite newer canonical state" in the original design brief).

## Writing a custom adapter

Implement whichever interfaces you need:

```ts
import type { MemoryStore } from "@memorie/storage";
import type { Memory, ListOptions, CountOptions } from "@memorie/types";

export class MyMemoryStore implements MemoryStore {
  async create(memory: Memory): Promise<Memory> { /* ... */ }
  async get(id: string): Promise<Memory | null> { /* ... */ }
  async update(id: string, patch: Partial<Memory>, options?: { expectedVersion?: number }): Promise<Memory> { /* ... */ }
  async delete(id: string): Promise<void> { /* ... */ }
  async list(options?: ListOptions): Promise<Memory[]> { /* ... */ }
  async count(options?: CountOptions): Promise<number> { /* ... */ }
}
```

Then verify it against the contract suite:

```ts
import { runMemoryStoreContractTests } from "@memorie/storage/contract-tests";
import { MyMemoryStore } from "../src/my-memory-store.js";

runMemoryStoreContractTests("MyMemoryStore", () => new MyMemoryStore());
```

Contract suites exist for every capability implemented so far —
`runMemoryStoreContractTests`, `runSearchStoreContractTests`,
`runVectorStoreContractTests`, `runConflictStoreContractTests`,
`runGraphStoreContractTests`, `runCacheStoreContractTests` (all exported
from `@memorie/storage/contract-tests`). This is exactly how every
adapter in this repo is verified — e.g.
`packages/storage-postgres/test/postgres-store.test.ts` and
`packages/cache-redis/test/redis-cache-store.test.ts` — every
implemented adapter passes the same suite (spec section 57).

## Planned adapters (not yet built)

MongoDB, MySQL (storage); Qdrant, Weaviate, Pinecone, Milvus, LanceDB
(real vector databases — `@memorie/vector-memory` is a brute-force
in-process reference implementation, not one of these); Elasticsearch,
OpenSearch (search); Neo4j, ArangoDB (real graph databases —
`@memorie/storage-memory`'s `InMemoryGraphStore` is the reference
implementation, not one of these); filesystem/S3 (blob). None of these
exist yet in this repo.

MongoDB in particular could not be added in this environment: it isn't
available through the Ubuntu package repositories this sandbox has
network access to (its official apt repo isn't on the allowlist), and
per the "no fake implementations" rule, an adapter isn't added here
without being verified against a live instance of the thing it adapts
— the same standard `@memorie/storage-postgres` and `@memorie/cache-redis`
were held to.

When an adapter is added, it will (a) pass the relevant contract test
suite against a live instance, (b) be documented here with any
capability caveats, and (c) be marked `experimental` in its
`package.json` description if it hasn't had real integration testing.
