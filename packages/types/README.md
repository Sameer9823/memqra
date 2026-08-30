# @memorie/types

Core type definitions for Memorie, the universal memory infrastructure engine.

This package has no runtime code of its own — it's the shared vocabulary
(`Memory`, `MemoryStore`, error classes, event types, etc.) that every other
`@memorie/*` package builds on. Install it directly if you're implementing a
custom storage adapter or embedding provider against Memorie's interfaces.

## Install

```bash
npm install @memorie/types
```

## What's inside

- **`memory.ts`** — the core `Memory` shape and related input/patch types.
- **`provenance.ts`**, **`relations.ts`**, **`conflict.ts`**, **`evolution.ts`** — supporting domain types for memory lineage, relationships, conflict resolution, and consolidation.
- **`query.ts`** — search/query types, including `DEFAULT_RANKING_WEIGHTS`.
- **`errors.ts`** — the `MemorieError` hierarchy (`MemoryNotFoundError`, `StorageError`, `ValidationError`, `VersionConflictError`, `TenantIsolationError`, and more) used consistently across every adapter.
- **`events.ts`**, **`observability.ts`** — event and tracing/logging contract types.
- **`capabilities.ts`**, **`ai.ts`**, **`security.ts`**, **`backup.ts`**, **`maintenance.ts`** — capability flags and supporting types for optional engine features.

## Usage

```ts
import type { Memory, MemoryStore } from "@memorie/types";
import { MemoryNotFoundError } from "@memorie/types";

class MyCustomStore implements MemoryStore {
  async get(id: string): Promise<Memory> {
    throw new MemoryNotFoundError(id);
  }
  // ...
}
```

## Related packages

- [`@memorie/storage`](../storage) — the adapter interfaces built on these types.
- [`@memorie/core`](../core) — the engine that ties everything together.

Part of the [Memorie](../../README.md) monorepo.
