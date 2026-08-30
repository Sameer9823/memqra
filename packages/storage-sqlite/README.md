# @memorie/storage-sqlite

SQLite `MemoryStore` and `VersionStore` adapter for Memorie, built on
[`better-sqlite3`](https://www.npmjs.com/package/better-sqlite3). Good for a
durable single-file/single-process store — local apps, CLIs, small services.

## Install

```bash
npm install @memorie/storage-sqlite
```

## What's inside

- **`SqliteStore`** — a `TransactionalMemoryStore` implementation backed by SQLite. Supports transactions via `better-sqlite3`.
- **`SqliteVersionStore`** — stores memory version history in SQLite.
- **`initSchema()`** — creates the required tables on a raw `better-sqlite3` `Database` instance, for advanced setups that want to manage the connection themselves.

## Usage

```ts
import { SqliteStore, SqliteVersionStore } from "@memorie/storage-sqlite";
import { createMemoryEngine } from "@memorie/core";

// File-backed:
const memoryStore = new SqliteStore("./memorie.db");

// Or in-memory (default if no path/Database is given):
const memoryStore = new SqliteStore();

const engine = createMemoryEngine({
  memoryStore,
  versionStore: new SqliteVersionStore("./memorie.db"),
});
```

Both `SqliteStore` and `SqliteVersionStore` accept either a file path
(string) or an existing `better-sqlite3` `Database` instance — pass the same
`Database` to both if you want them sharing one connection/file.

## Related packages

- [`@memorie/storage`](../storage) — the interfaces this package implements.
- [`@memorie/search-sqlite`](../search-sqlite) — a companion FTS5 full-text search store, also SQLite-backed.
- [`@memorie/storage-postgres`](../storage-postgres) — the equivalent adapter for PostgreSQL.
- [`@memorie/core`](../core) — the engine that consumes this store.

Part of the [Memorie](../../README.md) monorepo.
