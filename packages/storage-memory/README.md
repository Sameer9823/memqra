# @memorie/storage-memory

In-memory `MemoryStore` and `VersionStore` adapter for Memorie. Useful for
tests and local-first prototyping — nothing persists to disk.

## Install

```bash
npm install @memorie/storage-memory
```

## What's inside

- **`InMemoryStore`** — canonical `MemoryStore` implementation backed by a plain JS `Map`.
- **`InMemoryVersionStore`** — keeps memory version history in memory.
- **`InMemoryCacheStore`** — `CacheStore` implementation for the engine's optional cache layer.
- **`InMemoryConflictStore`** — `ConflictStore` implementation for recording/resolving conflicting memories.
- **`InMemoryGraphStore`** — `GraphStore` implementation for memory relationships.

## Usage

```ts
import { InMemoryStore, InMemoryVersionStore } from "@memorie/storage-memory";
import { createMemoryEngine } from "@memorie/core";

const engine = createMemoryEngine({
  memoryStore: new InMemoryStore(),
  versionStore: new InMemoryVersionStore(),
});

const memory = await engine.add({ content: "The user prefers dark mode." });
```

Every store here implements no-persistence, zero-dependency versions of the
`@memorie/storage` interfaces — ideal for unit tests, CI, and quick local
experimentation before swapping in a real backend like
[`@memorie/storage-sqlite`](../storage-sqlite) or
[`@memorie/storage-postgres`](../storage-postgres).

## Related packages

- [`@memorie/storage`](../storage) — the interfaces these classes implement.
- [`@memorie/core`](../core) — the engine that consumes these stores.

Part of the [Memorie](../../README.md) monorepo.
