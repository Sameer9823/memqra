# Benchmarks

Phase 7 of the design brief calls for "benchmarks with p50/p95/p99
tracking." `scripts/benchmark.mjs` measures `MemoryEngine` operation
latency and reports those percentiles.

## Running it

```sh
npm run build      # compiles every package to dist/, once
npm run benchmark  # node scripts/benchmark.mjs [iterations], default 1000
```

Sample output shape (numbers vary by machine and Node version):

```
memorie benchmark — 1000 iterations, InMemoryStore, node v22.x.x

operation     n  mean_ms  p50_ms  p95_ms  p99_ms  max_ms
---------  ----  -------  ------  ------  ------  ------
      add  1000     0.04    0.03    0.06    0.12    0.41
      get  1000     0.01    0.01    0.02    0.03    0.09
   update  1000     0.05    0.04    0.08    0.14    0.38
   search  1000     0.18    0.16    0.31    0.47    1.02
   delete  1000     0.02    0.02    0.03    0.05    0.11
```

## What it measures, and what it deliberately doesn't

The benchmark runs against `@memorie/storage-memory`'s
`InMemoryStore`/`InMemoryVersionStore` — the same dependency-free
adapter the test suite uses — not against SQLite, Postgres, or any
other persistent adapter. That's intentional, not a shortcut:

- It isolates the **engine's own overhead** — input validation,
  version recording, cache-aside bookkeeping when a `CacheStore` is
  configured, event emission, metric/log/span calls — from any one
  adapter's I/O cost (disk fsync, network round-trip, connection pool
  contention). Those adapter costs matter, but they're a property of
  the adapter and the environment it's benchmarked in, not of Memorie's
  core.
- It runs anywhere, in CI or locally, without a live database — same
  reasoning as why `@memorie/storage-memory` is what the unit test
  suite runs against by default.

To benchmark a real adapter, swap the `memoryStore`/`versionStore`
construction in `scripts/benchmark.mjs` for e.g. `PostgresStore`/
`PostgresVersionStore` from `@memorie/storage-postgres` — the operations
run, percentile math, and report are adapter-agnostic; only those two
lines change. Doing this against your own target database and Node
version, on hardware comparable to production, is how you'd get numbers
you can actually rely on for capacity planning — the numbers in this
doc and the script's own sample output are not that.

## How the percentiles are computed

Each recorded operation collects one elapsed-time sample per call (via
`performance.now()`, not `Date.now()`, for sub-millisecond resolution).
Percentiles use the nearest-rank method: samples are sorted ascending,
and `pXX` is the sample at index `ceil(XX/100 * n) - 1`. This avoids
pulling in a stats library for what's a handful of lines of code, at
the cost of the exact rank landing on a real sample rather than being
interpolated between two — fine for the "smell test" use case this
script serves, less appropriate for high-precision SLA reporting.

## What's exercised

One pass of `add()` for `iterations` memories (spread across 50
synthetic `subjectId`s within one namespace), then a full pass each of
`get()`, `update()`, `search()` (a keyword query, `limit: 10`), and
`delete()` over the same memories, in that order — so `get`/`update`
read/write memories that already exist, and `search` runs against a
fully-populated namespace rather than an empty one. `ingest()`,
`resolveConflict()`, and `consolidate()` are not currently benchmarked
here — they depend on optional evolution/conflict configuration this
script doesn't set up; the `LatencyRecorder` class in the script is
reusable for adding them the same way if you need those numbers.
