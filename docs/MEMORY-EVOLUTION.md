# Memory Evolution

## The core idea

A memory's `id` is a stable identity. Its `content`/`state`/scoring can
change over time without losing what it used to say. This is the
canonical example from the design brief, and it's exactly what
`packages/core/test/engine.test.ts` verifies:

```
Version 1: "User prefers TypeScript."
Version 2: "User prefers TypeScript for application development."
Version 3: "User prefers TypeScript for application development and Python for data science."
```

```ts
const m1 = await memory.add({ namespace: "users", subjectId: "u1", type: "preference", content: "User prefers TypeScript." });
const m2 = await memory.evolve(m1.id, { content: "User prefers TypeScript for application development." });
const m3 = await memory.evolve(m1.id, { content: "User prefers TypeScript for application development and Python for data science." });

await memory.history(m1.id);
// => [ {version: 1, snapshot: {...v1}}, {version: 2, snapshot: {...v2}}, {version: 3, snapshot: {...v3}} ]

await memory.getAt(m1.id, someTimestampBetweenV1AndV2);
// => the full Memory as it looked at that point in time
```

## Two levels of API

- **`engine.evolve(id, patch, options?)`** — the primitive. You already
  know which memory this update is about. Validates the patch, checks
  the lifecycle transition if `state` changes, applies optional
  `expectedVersion` optimistic concurrency, bumps `version`, and appends
  an immutable `MemoryVersion` snapshot. This is what `docs/MEMORY-LIFECYCLE.md`
  and versioning/time-travel are built on, and it's what `add()`/`update()`
  use internally.

- **`engine.ingest(input)`** — the automated pipeline (Phase 4, spec
  sections 7-8, 16-18). You give it new information without knowing
  whether it's new, a duplicate, an update, or a conflict, and it
  decides:

  ```
  Incoming Information
          |
  Identity Resolution
          |
  New or Existing?
       /       \
     NEW       EXISTING
      |            |
   Create       Compare
                   |
         +---------+---------+
         |         |         |
       Update   Conflict  Duplicate
  ```

  `ingest()` returns an `IngestResult` with `outcome: "created" |
  "updated" | "duplicate" | "conflict"` plus the relevant memory/conflict
  record. It calls `add()`/`update()` internally, so every outcome is
  still fully validated and versioned.

## Configuring the pipeline

```ts
const memory = createMemoryEngine({
  memoryStore,
  versionStore,
  conflictStore, // required for the "conflict" outcome and resolveConflict()
  evolution: {
    identityKey: "key",            // default; see below
    identityResolver,              // optional override
    duplicateDetector,              // optional override
    conflictDetector,               // optional override
    intelligenceProvider,           // optional MemoryIntelligenceProvider
    resolutionStrategy: "manual",   // default used by resolveConflict() when no strategy is passed
  },
});
```

### Identity resolution

Genuinely telling whether two pieces of free text describe "the same
fact" requires semantic/entity understanding. Rather than fake that with
string heuristics, the default `IdentityResolver`
(`packages/core/src/evolution/identity-resolver.ts`) only honors an
**explicit, caller-supplied identity**: if the incoming input carries
`metadata[identityKey]` (default key: `"key"`, e.g.
`{ key: "preferred_language" }`), any existing active/updated memory in
the same tenant/namespace/subject/type scope with the same
`metadata[identityKey]` is treated as the same identity — specifically
the most recently updated one, so an unresolved conflict between two
memories sharing a key doesn't create ambiguity.

Input without an identity key always resolves to "no match" and falls
through to duplicate detection, then to plain creation. This is a
documented limitation, not a guess — for semantic identity resolution,
supply a custom `IdentityResolver` (typically backed by a
`MemoryIntelligenceProvider` or embedding similarity).

### Duplicate detection

Two policies ship in `packages/core/src/evolution/duplicate-detector.ts`:

- `createExactTextDuplicateDetector()` — byte-for-byte identical content.
- `createNormalizedTextDuplicateDetector()` — the **default**: equal
  after trim/lower-case/whitespace-collapse. Catches re-submits that
  differ only in incidental formatting.

Duplicates are never silently deleted (spec section 16): `ingest()`
simply returns `{ outcome: "duplicate", memory: <existing>, skipped:
<input> }` without creating anything.

### Conflict detection

The default `ConflictDetector`
(`packages/core/src/evolution/conflict-detector.ts`) only flags a
conflict when a `MemoryIntelligenceProvider.compare()` reports
`relation: "contradicts"`. Without one configured, a matched identity
with different content is always treated as a plain **update** — this
matches the spec's own primary example (the TypeScript preference
getting more detailed across versions is evolution, not conflict).
Flagging *every* content change under a matched identity as a conflict
would be a fake heuristic that misclassifies ordinary refinement as
contradiction, so the core deliberately doesn't do that.

When a conflict is detected, `ingest()`:

1. Persists the incoming input as its own new `Memory` (via the normal
   `add()` path — validated, versioned).
2. Records an open `MemoryConflict { memoryA: <existing.id>, memoryB:
   <new.id>, status: "open" }` in the configured `ConflictStore`.
3. Emits `memory.conflict_detected`.
4. Returns `{ outcome: "conflict", memory: <new>, conflict }`. Both
   memories stay `state: "active"` until resolved.

### Resolving conflicts

`engine.resolveConflict(conflictId, strategy?)` applies one of the spec
section 17 strategies:

| Strategy | Effect |
|---|---|
| `latest` | The more recently created memory wins; the other is marked `superseded`. |
| `supersede` | The incoming (`memoryB`) side always wins, deterministically. |
| `highest-confidence` | Higher `confidence` wins (ties favor `memoryB`). |
| `highest-importance` | Higher `importance` wins (ties favor `memoryB`). |
| `merge` | Calls `MemoryIntelligenceProvider.consolidate([A, B])`, creates a new memory with `mergedFrom: [A.id, B.id]`, marks both sources `state: "merged"`. Throws `UnsupportedCapabilityError` without a provider configured. |
| `manual` | The default when no strategy is configured or passed — `resolveConflict()` throws, telling the caller to pass an explicit strategy. Nothing is ever auto-resolved silently. |

Non-merge resolutions mark the loser `state: "superseded"` with
`supersededBy` set, and the winner's `supersedes` field set — both via
the normal versioned update path, and emit `memory.superseded`.

### Consolidation

`engine.consolidate(memoryIds)` folds several existing memories into one
directly (spec section 18), independent of any conflict. It requires
`evolution.intelligenceProvider` — real consolidation needs semantic
judgement the core does not fake without one — and throws
`UnsupportedCapabilityError` otherwise. On success it creates a new
memory with `mergedFrom` set to the source ids, marks every source
`state: "merged"`, and emits `memory.merged`/`memory.consolidated`.

## What this deliberately does not do

Per "no fake implementations" (spec section 77 / `docs/CONTRIBUTING.md`):

- No semantic/embedding-based identity resolution ships by default —
  only the explicit `metadata[identityKey]` mechanism. Wire your own
  `IdentityResolver` for that.
- No conflict is ever inferred from content differing alone; it always
  requires a `MemoryIntelligenceProvider` verdict.
- `merge`/`consolidate()` never synthesize content themselves (e.g. by
  naive string concatenation as a "good enough" default) — they require
  a real `MemoryIntelligenceProvider.consolidate()` implementation.

See `packages/core/test/evolution.test.ts` for the full set of tested
scenarios (spec section 66, scenarios 4-7) and
`examples/09-conflict-resolution/index.mjs` for a runnable walkthrough.
