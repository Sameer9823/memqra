import { describe, it, expect, beforeEach } from "vitest";
import type { CacheStore } from "../secondary-stores.js";

/**
 * Runs a standard contract suite against any CacheStore implementation.
 * Every implemented CacheStore adapter must pass this suite.
 */
export function runCacheStoreContractTests(
  name: string,
  createStore: () => Promise<CacheStore> | CacheStore,
): void {
  describe(`CacheStore contract: ${name}`, () => {
    let store: CacheStore;

    beforeEach(async () => {
      store = await createStore();
      await store.clear();
    });

    it("returns null for a missing key", async () => {
      expect(await store.get("missing")).toBeNull();
    });

    it("stores and retrieves a value", async () => {
      await store.set("key1", { hello: "world" });
      expect(await store.get("key1")).toEqual({ hello: "world" });
    });

    it("overwrites an existing value", async () => {
      await store.set("key1", "first");
      await store.set("key1", "second");
      expect(await store.get("key1")).toBe("second");
    });

    it("delete() removes a key", async () => {
      await store.set("key1", "value");
      await store.delete("key1");
      expect(await store.get("key1")).toBeNull();
    });

    it("delete() on a missing key does not throw", async () => {
      await expect(store.delete("missing")).resolves.not.toThrow();
    });

    it("clear() removes every key", async () => {
      await store.set("key1", "a");
      await store.set("key2", "b");
      await store.clear();
      expect(await store.get("key1")).toBeNull();
      expect(await store.get("key2")).toBeNull();
    });

    it("respects ttlMs, expiring after the TTL elapses", async () => {
      await store.set("key1", "value", { ttlMs: 20 });
      expect(await store.get("key1")).toBe("value");
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(await store.get("key1")).toBeNull();
    });

    it("without ttlMs, a value does not expire on its own", async () => {
      await store.set("key1", "value");
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(await store.get("key1")).toBe("value");
    });
  });
}
