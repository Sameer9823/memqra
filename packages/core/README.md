# @memorie/core

Memorie: universal memory infrastructure engine. This is the core
orchestration layer — the package most applications depend on directly. It
ties a canonical `MemoryStore` together with optional secondary projections
(search, vector, graph, cache) behind one `MemoryEngine` API.

## Install

```bash
npm install @memorie/core
```

You'll also need at least one storage adapter — for a zero-dependency start:

```bash
npm install @memorie/storage-memory
```

## Quick start

```ts
import { createMemoryEngine } from "@memorie/core";
import { InMemoryStore } from "@memorie/storage-memory";

const engine = createMemoryEngine({
  memoryStore: new InMemoryStore(),
});

const memory = await engine.add({
  content: "The user prefers dark mode and replies in short sentences.",
});

const results = await engine.search({ query: "user preferences" });
```

## What's inside

- **`MemoryEngine` / `createMemoryEngine()`** — the main engine class and its factory function. Accepts a `memoryStore` (required) plus any combination of optional stores/providers (`versionStore`, `searchStore`, `vectorStore`, `embeddingProvider`, `graphStore`, `cacheStore`, `provenanceStore`, `conflictStore`) and config for ranking, evolution, observability, and security.
- **`lifecycle.ts`** — `canTransition()` / `assertTransition()`, governing valid memory state transitions.
- **`validation.ts`** — `validateNewMemoryInput()` / `validateMemoryPatch()`, input validation used internally by the engine.
- **`event-emitter.ts`** — `MemorieEventEmitter`, the engine's internal event bus (memory added/updated/removed, etc.).
- **`ranking.ts`** — scoring functions (`recencyScore()`, `frequencyScore()`) behind the engine's default result ranking.
- **`keyword-search.ts`** / **`hybrid-search.ts`** — keyword scoring and the logic that blends keyword + vector search results when both a `searchStore` and `vectorStore` are configured.
- **`null-version-store.ts`** — a no-op `VersionStore` used internally when none is configured.
- **`evolution/`** — memory consolidation logic (see `MemoryEngineConfig.evolution`), requires a `MemoryIntelligenceProvider` to actually run `consolidate()`.

## Composing an engine

`MemoryEngine` is the same class regardless of which adapters you plug in —
swap storage backends without touching application code:

```ts
import { createMemoryEngine } from "@memorie/core";
import { SqliteStore, SqliteVersionStore } from "@memorie/storage-sqlite";
import { SqliteSearchStore } from "@memorie/search-sqlite";
import { InMemoryVectorStore } from "@memorie/vector-memory";
import { HashEmbeddingProvider } from "@memorie/embeddings";

const engine = createMemoryEngine({
  memoryStore: new SqliteStore("./memorie.db"),
  versionStore: new SqliteVersionStore("./memorie.db"),
  searchStore: new SqliteSearchStore("./memorie-search.db"),
  vectorStore: new InMemoryVectorStore(),
  embeddingProvider: new HashEmbeddingProvider(),
});
```

See `docs/ARCHITECTURE.md` at the repo root for the full "canonical store +
projections" model this package implements.

## Related packages

Every adapter package in this monorepo plugs into `MemoryEngineConfig`:
[`@memorie/storage-memory`](../storage-memory),
[`@memorie/storage-sqlite`](../storage-sqlite),
[`@memorie/storage-postgres`](../storage-postgres),
[`@memorie/storage-security`](../storage-security),
[`@memorie/cache-redis`](../cache-redis),
[`@memorie/search-sqlite`](../search-sqlite),
[`@memorie/vector-memory`](../vector-memory),
[`@memorie/embeddings`](../embeddings). All build on
[`@memorie/types`](../types) and [`@memorie/storage`](../storage).

Part of the [Memorie](../../README.md) monorepo.
