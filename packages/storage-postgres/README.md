# @memorie/storage-postgres

PostgreSQL `MemoryStore`, `VersionStore`, and `ConflictStore` adapter for
Memorie, built on [`pg`](https://www.npmjs.com/package/pg). The recommended
backend for multi-process/production deployments.

## Install

```bash
npm install @memorie/storage-postgres
```

Requires a running PostgreSQL instance (developed/tested against
PostgreSQL 16).

## What's inside

- **`PostgresStore`** — a `TransactionalMemoryStore` implementation backed by PostgreSQL.
- **`PostgresVersionStore`** — stores memory version history in PostgreSQL.
- **`PostgresConflictStore`** — records and resolves conflicting memories in PostgreSQL.
- **`CREATE_MEMORIES_TABLE`, `CREATE_VERSIONS_TABLE`, `CREATE_CONFLICTS_TABLE`** — the raw schema SQL, exported for advanced setups (custom migration tooling, etc.).

## Usage

```ts
import { Pool } from "pg";
import {
  PostgresStore,
  PostgresVersionStore,
  PostgresConflictStore,
} from "@memorie/storage-postgres";
import { createMemoryEngine } from "@memorie/core";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const engine = createMemoryEngine({
  memoryStore: new PostgresStore(pool),
  versionStore: new PostgresVersionStore(pool),
  conflictStore: new PostgresConflictStore(pool),
});
```

Each store's constructor also accepts a raw connection string instead of a
`Pool`:

```ts
new PostgresStore(process.env.DATABASE_URL!);
```

## Related packages

- [`@memorie/storage`](../storage) — the interfaces this package implements.
- [`@memorie/storage-sqlite`](../storage-sqlite) — the equivalent adapter for SQLite.
- [`@memorie/core`](../core) — the engine that consumes this store.

Part of the [Memorie](../../README.md) monorepo.
