// Run after `npm run build` from the repo root:
//   node scripts/benchmark.mjs [iterations]
//
// Phase 7 benchmarking (design brief: "benchmarks with p50/p95/p99
// tracking"). Measures MemoryEngine operation latency against the
// dependency-free InMemoryStore/InMemoryVersionStore — deliberately not
// a specific persistent adapter, so this runs anywhere without a live
// database, and isolates the engine's own overhead (validation,
// versioning, event emission, ...) from any one adapter's I/O cost.
//
// To benchmark a real adapter instead, swap the `memoryStore`/
// `versionStore` construction below for e.g. `PostgresStore`/
// `PostgresVersionStore` from `@memorie/storage-postgres` — everything
// else (the operations run, the percentile math, the report) is
// adapter-agnostic.

import { createMemoryEngine } from "../packages/core/dist/index.js";
import { InMemoryStore, InMemoryVersionStore } from "../packages/storage-memory/dist/index.js";

const ITERATIONS = Number(process.argv[2]) > 0 ? Number(process.argv[2]) : 1000;

/** Records elapsed-ms samples for one named operation and computes percentiles from them. */
class LatencyRecorder {
  constructor(name) {
    this.name = name;
    this.samplesMs = [];
  }

  /** Times a single call to `fn`, recording its elapsed time in milliseconds. */
  async record(fn) {
    const start = performance.now();
    const result = await fn();
    this.samplesMs.push(performance.now() - start);
    return result;
  }

  /** Linear-interpolation-free percentile: nearest-rank method (simple, no library needed). */
  percentile(p) {
    if (this.samplesMs.length === 0) return NaN;
    const sorted = [...this.samplesMs].sort((a, b) => a - b);
    const rank = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
    return sorted[Math.max(0, rank)];
  }

  summary() {
    const n = this.samplesMs.length;
    const mean = n === 0 ? NaN : this.samplesMs.reduce((a, b) => a + b, 0) / n;
    return {
      operation: this.name,
      n,
      mean_ms: round(mean),
      p50_ms: round(this.percentile(50)),
      p95_ms: round(this.percentile(95)),
      p99_ms: round(this.percentile(99)),
      max_ms: round(Math.max(...this.samplesMs)),
    };
  }
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function printTable(rows) {
  const columns = ["operation", "n", "mean_ms", "p50_ms", "p95_ms", "p99_ms", "max_ms"];
  const widths = Object.fromEntries(
    columns.map((c) => [c, Math.max(c.length, ...rows.map((r) => String(r[c]).length))]),
  );
  const line = (cells) => columns.map((c) => String(cells[c]).padStart(widths[c])).join("  ");
  console.log(line(Object.fromEntries(columns.map((c) => [c, c]))));
  console.log(columns.map((c) => "-".repeat(widths[c])).join("  "));
  for (const row of rows) console.log(line(row));
}

async function main() {
  const memory = createMemoryEngine({
    memoryStore: new InMemoryStore(),
    versionStore: new InMemoryVersionStore(),
  });

  const addRecorder = new LatencyRecorder("add");
  const getRecorder = new LatencyRecorder("get");
  const updateRecorder = new LatencyRecorder("update");
  const searchRecorder = new LatencyRecorder("search");
  const deleteRecorder = new LatencyRecorder("delete");

  const ids = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const created = await addRecorder.record(() =>
      memory.add({
        namespace: "benchmark",
        subjectId: `subject_${i % 50}`,
        type: "fact",
        content: `benchmark memory number ${i} about widgets and gadgets`,
      }),
    );
    ids.push(created.id);
  }

  for (const id of ids) {
    await getRecorder.record(() => memory.get(id));
  }

  for (const id of ids) {
    await updateRecorder.record(() => memory.update(id, { content: `updated content for ${id}` }));
  }

  for (let i = 0; i < ITERATIONS; i++) {
    await searchRecorder.record(() => memory.search({ query: "widgets", namespace: "benchmark", limit: 10 }));
  }

  for (const id of ids) {
    await deleteRecorder.record(() => memory.delete(id));
  }

  console.log(`\nmemorie benchmark — ${ITERATIONS} iterations, InMemoryStore, node ${process.version}\n`);
  printTable(
    [addRecorder, getRecorder, updateRecorder, searchRecorder, deleteRecorder].map((r) => r.summary()),
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
