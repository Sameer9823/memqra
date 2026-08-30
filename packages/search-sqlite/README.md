# @memorie/search-sqlite

SQLite FTS5-backed `SearchStore` adapter for Memorie (full-text keyword
search), built on
[`better-sqlite3`](https://www.npmjs.com/package/better-sqlite3).

## Install

```bash
npm install @memorie/search-sqlite
```

## What's inside

- **`SqliteSearchStore`** — a `SearchStore` implementation using SQLite's [FTS5](https://www.sqlite.org/fts5.html) extension for keyword full-text search.
- **`initSearchSchema()`** — creates the FTS5 virtual table on a raw `better-sqlite3` `Database` instance, for advanced setups.
- **`CREATE_FTS_TABLE`** — the raw schema SQL.

## Usage

```ts
import { SqliteSearchStore } from "@memorie/search-sqlite";
import { InMemoryStore } from "@memorie/storage-memory";
import { createMemoryEngine } from "@memorie/core";

const engine = createMemoryEngine({
  memoryStore: new InMemoryStore(),
  searchStore: new SqliteSearchStore("./memorie-search.db"), // or omit for in-memory
});

const results = await engine.search({ query: "dark mode preference" });
```

This gives the engine keyword-based full-text search. For semantic
(embedding-based) search instead of or alongside keyword search, pair this
with [`@memorie/vector-memory`](../vector-memory) and
[`@memorie/embeddings`](../embeddings) — `MemoryEngine` combines both via
hybrid search when both a `searchStore` and `vectorStore` are configured.

## Related packages

- [`@memorie/storage`](../storage) — the `SearchStore` interface this package implements.
- [`@memorie/storage-sqlite`](../storage-sqlite) — the companion `MemoryStore`/`VersionStore` SQLite adapter.
- [`@memorie/vector-memory`](../vector-memory) — semantic search counterpart.
- [`@memorie/core`](../core) — the engine that consumes this store, including its hybrid search logic.

Part of the [Memorie](../../README.md) monorepo.
