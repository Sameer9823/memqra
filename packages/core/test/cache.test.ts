import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryStore, InMemoryVersionStore, InMemoryCacheStore } from "@memorie/storage-memory";
import { createMemoryEngine, type MemoryEngine } from "../src/engine.js";

/** Wraps InMemoryCacheStore to count get/set/delete calls without changing behavior. */
class CountingCacheStore extends InMemoryCacheStore {
  getCalls = 0;
  setCalls = 0;
  deleteCalls = 0;

  override async get<T>(key: string): Promise<T | null> {
    this.getCalls++;
    return super.get<T>(key);
  }
  override async set<T>(key: string, value: T, options?: { ttlMs?: number }): Promise<void> {
    this.setCalls++;
    return super.set(key, value, options);
  }
  override async delete(key: string): Promise<void> {
    this.deleteCalls++;
    return super.delete(key);
  }
}

function makeEngine(): { engine: MemoryEngine; memoryStore: InMemoryStore; cache: CountingCacheStore } {
  const memoryStore = new InMemoryStore();
  const cache = new CountingCacheStore();
  const engine = createMemoryEngine({
    memoryStore,
    versionStore: new InMemoryVersionStore(),
    cacheStore: cache,
  });
  return { engine, memoryStore, cache };
}

describe("MemoryEngine cache-aside behavior (Phase 6)", () => {
  let engine: MemoryEngine;
  let memoryStore: InMemoryStore;
  let cache: CountingCacheStore;

  beforeEach(() => {
    ({ engine, memoryStore, cache } = makeEngine());
  });

  it("get() populates the cache on a miss and serves from it on a hit", async () => {
    const created = await engine.add({ namespace: "users", subjectId: "u1", type: "fact", content: "hello" });

    // add() itself doesn't populate the cache; the first get() does.
    const first = await engine.get(created.id);
    expect(first?.content).toBe("hello");
    expect(cache.setCalls).toBe(1);

    // Mutate the canonical store directly, bypassing the engine, so a
    // cache hit is distinguishable from a fresh read.
    await memoryStore.update(created.id, { content: "mutated directly" });

    const second = await engine.get(created.id);
    expect(second?.content).toBe("hello"); // served from cache, not the mutated canonical value
  });

  it("update() invalidates the cache so the next get() reflects the new value", async () => {
    const created = await engine.add({ namespace: "users", subjectId: "u1", type: "fact", content: "hello" });
    await engine.get(created.id); // populate cache

    await engine.update(created.id, { content: "updated via engine" });
    expect(cache.deleteCalls).toBeGreaterThanOrEqual(1);

    const after = await engine.get(created.id);
    expect(after?.content).toBe("updated via engine");
  });

  it("delete() invalidates the cache", async () => {
    const created = await engine.add({ namespace: "users", subjectId: "u1", type: "fact", content: "hello" });
    await engine.get(created.id); // populate cache

    await engine.delete(created.id);
    expect(cache.deleteCalls).toBeGreaterThanOrEqual(1);
    expect(await engine.get(created.id)).toBeNull();
  });

  it("without a CacheStore configured, get() reads straight through with no error", async () => {
    const plainEngine = createMemoryEngine({ memoryStore: new InMemoryStore() });
    const created = await plainEngine.add({ namespace: "users", subjectId: "u1", type: "fact", content: "hi" });
    expect((await plainEngine.get(created.id))?.content).toBe("hi");
  });

  it("capabilities() reports cache based on whether a CacheStore is configured", () => {
    expect(engine.capabilities().cache).toBe(true);
    const plainEngine = createMemoryEngine({ memoryStore: new InMemoryStore() });
    expect(plainEngine.capabilities().cache).toBe(false);
  });
});
