import { runCacheStoreContractTests } from "@memorie/storage/contract-tests";
import { InMemoryCacheStore } from "../src/in-memory-cache-store.js";

runCacheStoreContractTests("InMemoryCacheStore", () => new InMemoryCacheStore());
