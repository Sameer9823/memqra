# Contributing to Memorie

Thanks for considering it. This document covers how the repo is laid
out, how to get a change tested, and the one rule that matters most
here: **no fake implementations.**

## The "no fake implementations" rule

Every adapter in `packages/` implements a capability interface from
`@memorie/storage` or `@memorie/types` (`MemoryStore`, `VectorStore`,
`SearchStore`, `GraphStore`, `CacheStore`, `ConflictStore`,
`ProvenanceStore`, `EmbeddingProvider`, `Logger`, `MetricsProvider`,
`Tracer`, ...) and is verified against a **real** instance of the thing
it adapts — a real local PostgreSQL, a real local Redis, real
`node:crypto` — not an in-memory mock standing in for it. An adapter
for MongoDB, MySQL, S3, Elasticsearch, Qdrant, or Neo4j is welcome, but
it needs to pass the shared contract-test suite against a live
instance of that system before it's added — see `docs/ADAPTERS.md` for
exactly what "verified" means and why this repo doesn't ship
placeholder adapters.

`@memorie/vector-memory` and `@memorie/storage-memory` are not
exceptions to this — they're real implementations too (real
brute-force cosine similarity, a real in-process store), just
intentionally non-persistent / non-scalable ones, documented as such.

## Repo layout

This is an npm workspaces monorepo. Each capability or adapter is its
own package under `packages/*`:

- `@memorie/types` — the data model and interfaces every adapter
  implements. Start here to understand what a `Memory` is and what
  each capability interface requires.
- `@memorie/core` — the `MemoryEngine`, which orchestrates whichever
  adapters you configure. This is where cross-cutting behavior
  (validation, versioning, events, observability, security,
  maintenance) lives — adapters themselves stay simple.
- `@memorie/storage` — the interfaces (re-exported from `@memorie/types`
  in some cases) plus `contract-tests`, the shared test suites every
  adapter for a given capability must pass.
- Everything else (`storage-memory`, `storage-sqlite`,
  `storage-postgres`, `storage-security`, `cache-redis`,
  `search-sqlite`, `vector-memory`, `embeddings`) is a concrete adapter
  or adapter-composing utility.

See `docs/ARCHITECTURE.md` for the full picture and `docs/ADAPTERS.md`
for the capability model in detail.

## Adding a new adapter

1. Pick the capability interface you're implementing (`MemoryStore`,
   `SearchStore`, etc. — `docs/ADAPTERS.md` has the current list and
   examples).
2. Create `packages/<capability>-<backend>/` following the shape of an
   existing adapter package for the same capability (package.json,
   tsconfig.json, `src/index.ts` re-exporting your class, `test/`).
3. Implement the interface.
4. Verify it against the shared contract-test suite for that
   capability, against a live instance of the backend:

   ```ts
   import { runMemoryStoreContractTests } from "@memorie/storage/contract-tests";
   import { MyStore } from "../src/my-store.js";

   runMemoryStoreContractTests("MyStore", () => new MyStore(/* live connection */));
   ```

5. Add it to the table in `docs/ADAPTERS.md` and the "Packages" table
   in `README.md`, with any capability caveats (e.g. whether
   `transaction()` gives real rollback semantics).
6. If the backend needs a live service to test against, wire it into
   `.github/workflows/ci.yml` as a service container, following the
   PostgreSQL/Redis jobs already there.

## Adding an engine-level feature (hooks, pipeline steps, etc.)

Look at how `Logger`/`MetricsProvider`/`Tracer` (observability),
`AuthorizeFn`/`RedactFn` (security), or the ingest/conflict pipeline
are wired into `packages/core/src/engine.ts` before adding something
new — the pattern across all of these is the same: a small,
provider-independent interface in `@memorie/types`, an optional field on
the relevant `*Config` in `engine.ts`, a private field set in the
constructor, and a no-op default when it isn't configured so nothing
downstream needs to branch on whether the feature is in use.

## Development commands

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
npm run benchmark   # after `npm run build`
```

## Before opening a PR

- `npm run lint && npm run typecheck && npm test && npm run build` all
  pass.
- New code has tests — contract tests for a new adapter, unit tests for
  engine-level logic (see existing files in `packages/core/test/` for
  the style).
- Relevant docs are updated (`README.md`'s "Packages"/"Roadmap"
  sections, and the specific `docs/*.md` file for the area you
  touched).
- No memory `content` is ever passed to a `Logger`/`MetricsProvider`
  call inside the engine — this is a deliberate constraint (see
  `docs/SECURITY.md`), not an oversight to "fix."

## Code style

TypeScript, ES modules (`"type": "module"` everywhere), `tsc -b`
project references for incremental builds. Run `npm run lint` — ESLint
plus `typescript-eslint` are configured at the root and apply across
every package.
