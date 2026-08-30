# Memory Lifecycle

A `Memory` moves through an explicit state machine, implemented in
`packages/core/src/lifecycle.ts`. Invalid transitions throw
`InvalidStateTransitionError` rather than silently succeeding (spec
section 12) — this is a deliberate choice: a memory system that lets
`deleted -> active` succeed silently makes deletion meaningless.

## States

- `active` — normal, current, in-force memory.
- `updated` — set automatically after a content/scoring change via
  `engine.update()`/`engine.evolve()`, unless the caller explicitly sets
  a different target state. It behaves like `active` for retrieval
  purposes but signals "this has changed at least once."
- `archived` — retained but excluded from normal recall paths by
  convention (the core doesn't enforce this filtering itself — callers
  decide what "excluded from recall" means for their query patterns).
- `expired` — past its `expiresAt`. The core does not currently run a
  background expiry sweep (that's part of Phase 7 retention tooling);
  callers can set this explicitly today.
- `superseded` — replaced by a newer memory (see `supersededBy`/`supersedes`
  fields on `Memory`).
- `merged` — consolidated into another memory (see `mergedFrom`).
- `deleted` — terminal. No transitions out.

## Transition table

| From | Allowed To |
|---|---|
| `active` | `updated`, `archived`, `expired`, `superseded`, `merged`, `deleted` |
| `updated` | `active`, `archived`, `expired`, `superseded`, `merged`, `deleted` |
| `archived` | `active`, `deleted` |
| `expired` | `archived`, `deleted` |
| `superseded` | `deleted` |
| `merged` | `deleted` |
| `deleted` | *(none — terminal)* |

(See `ALLOWED_TRANSITIONS` in `packages/core/src/lifecycle.ts` for the
source of truth.)

## How state changes relate to versioning

Every call to `engine.update()`/`engine.evolve()` — including pure state
transitions with no content change — creates a new `MemoryVersion`
snapshot (see `MEMORY-EVOLUTION.md`). This means the full lifecycle
history of a memory, not just its content history, is reconstructable
via `engine.history(memoryId)`.
