import { runMemoryStoreContractTests } from "@memorie/storage/contract-tests";
import { SqliteStore } from "../src/sqlite-store.js";

runMemoryStoreContractTests("SqliteStore", () => new SqliteStore(":memory:"));
