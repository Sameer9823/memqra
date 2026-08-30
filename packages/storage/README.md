# @memorie/storage

Storage capability interfaces and adapter contract tests for Memorie.

This package defines the abstract contracts (`MemoryStore`, `VersionStore`,
`ProvenanceStore`, `ConflictStore`, and the secondary-projection stores) that
every concrete backend — SQLite, Postgres, Redis, in-memory — implements. It
also ships a reusable **contract test suite** so any new adapter can be
verified against the same behavioral expectations as the built-in ones.

## Install

```bash
npm install @memorie/storage
```

## What's inside

- **`memory-store.ts`** — the canonical `MemoryStore` interface (and `TransactionalMemoryStore` for backends that support transactions), plus the `isTransactional()` type guard.
- **`version-store.ts`** — interface for storing memory version history.
- **`provenance-store.ts`** — interface for tracking where a memory came from.
- **`conflict-store.ts`** — interface for recording and resolving conflicting memories.
- **`secondary-stores.ts`** — interfaces for optional projections: `SearchStore`, `VectorStore`, `GraphStore`, `CacheStore`.

## Contract tests

```ts
import { memoryStoreContractTests } from "@memorie/storage/contract-tests";
import { InMemoryStore } from "@memorie/storage-memory";

memoryStoreContractTests(() => new InMemoryStore());
```

Run the same suite against any `MemoryStore` implementation — built-in or
your own — to confirm it satisfies Memorie's expectations (CRUD semantics,
tenant isolation, error types, etc.) before wiring it into
[`@memorie/core`](../core).

## Implementing a custom adapter

1. Depend on `@memorie/types` for the shared domain types.
2. Implement one or more interfaces from this package (`MemoryStore` is required; the rest are optional projections).
3. Run the relevant contract test suite from `@memorie/storage/contract-tests` against your implementation.
4. Pass an instance into `createMemoryEngine()` from [`@memorie/core`](../core).

## Related packages

- [`@memorie/storage-memory`](../storage-memory), [`@memorie/storage-sqlite`](../storage-sqlite), [`@memorie/storage-postgres`](../storage-postgres) — `MemoryStore`/`VersionStore` implementations.
- [`@memorie/cache-redis`](../cache-redis) — `CacheStore` implementation.
- [`@memorie/search-sqlite`](../search-sqlite) — `SearchStore` implementation.
- [`@memorie/vector-memory`](../vector-memory) — `VectorStore` implementation.
- [`@memorie/storage-security`](../storage-security) — a `MemoryStore` decorator for encryption at rest.

Part of the [Memorie](../../README.md) monorepo.
