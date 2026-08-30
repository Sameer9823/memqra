import { afterAll } from "vitest";
import { runCacheStoreContractTests } from "@memorie/storage/contract-tests";
import { RedisCacheStore } from "../src/redis-cache-store.js";

const url = process.env.MEMORIE_TEST_REDIS_URL ?? "redis://127.0.0.1:6379";

const stores: RedisCacheStore[] = [];

runCacheStoreContractTests("RedisCacheStore", () => {
  const store = new RedisCacheStore(url, { keyPrefix: "memorie:test:" });
  stores.push(store);
  return store;
});

afterAll(async () => {
  await Promise.all(stores.map((s) => s.close()));
});
