// Requires a running PostgreSQL and Redis instance (see below). Run
// after `npm run build` from the repo root:
//   node examples/11-postgres-redis/index.mjs
//
// Demonstrates the Phase 6 infrastructure adapters: @memorie/storage-postgres
// as the canonical MemoryStore (with real BEGIN/COMMIT/ROLLBACK transactions)
// and @memorie/cache-redis as a real cache-aside CacheStore.
//
// Connection strings default to local defaults; override with:
//   MEMORIE_TEST_POSTGRES_URL=postgres://user:pass@host:5432/dbname
//   MEMORIE_TEST_REDIS_URL=redis://host:6379

import { createMemoryEngine } from "../../packages/core/dist/index.js";
import { PostgresStore, PostgresVersionStore } from "../../packages/storage-postgres/dist/index.js";
import { RedisCacheStore } from "../../packages/cache-redis/dist/index.js";

const postgresUrl =
  process.env.MEMORIE_TEST_POSTGRES_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/memorie_test";
const redisUrl = process.env.MEMORIE_TEST_REDIS_URL ?? "redis://127.0.0.1:6379";

const memoryStore = new PostgresStore(postgresUrl);
await memoryStore.init(); // idempotent CREATE TABLE IF NOT EXISTS

const cacheStore = new RedisCacheStore(redisUrl, { keyPrefix: "memorie:example:" });
await cacheStore.clear(); // start from a clean slate for this demo

const memory = createMemoryEngine({
  memoryStore,
  versionStore: new PostgresVersionStore(memoryStore.raw),
  cacheStore,
});

const doc = await memory.add({
  namespace: "documents",
  subjectId: "doc_9001",
  type: "summary",
  content: "Q3 report: revenue up 12%, churn flat.",
  importance: 0.8,
  confidence: 1.0,
  source: "application",
});
console.log(`stored in PostgreSQL: ${doc.id}`);

// First get() is a cache miss - reads through to Postgres and populates Redis.
console.time("first get() (cache miss)");
await memory.get(doc.id);
console.timeEnd("first get() (cache miss)");

// Second get() is a cache hit - served from Redis.
console.time("second get() (cache hit)");
const cached = await memory.get(doc.id);
console.timeEnd("second get() (cache hit)");
console.log(`content: "${cached.content}"`);

// A real PostgreSQL transaction: both writes commit together, or neither
// does. Uses the raw MemoryStore (via `tx`) directly for both writes -
// mixing in memory.add()/update() here wouldn't actually participate in
// the transaction, since those call the engine's own `memoryStore`
// reference, not `tx`. Raw-store writes also bypass the engine's cache
// invalidation, so the Redis entry for `doc` stays stale until we
// invalidate it below.
await memoryStore.transaction(async (tx) => {
  await tx.update(doc.id, { importance: 0.95 });
  const related = await tx.create({
    id: crypto.randomUUID(),
    namespace: "documents",
    subjectId: "doc_9001",
    type: "note",
    content: "Follow-up: confirm EMEA numbers with finance.",
    state: "active",
    importance: 0.5,
    confidence: 0.5,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    accessCount: 0,
    version: 1,
  });
  console.log(`created ${related.id} inside the same transaction as the importance update`);
});

// The cache still holds the pre-transaction value here, by design (see
// the note above) - so we invalidate it explicitly before reading again.
await cacheStore.delete(`memory:${doc.id}`);
const afterTx = await memory.get(doc.id);
console.log(`importance after transaction: ${afterTx.importance}`);

await cacheStore.close();
await memoryStore.close();
