import { runSearchStoreContractTests } from "@memorie/storage/contract-tests";
import { SqliteSearchStore } from "../src/sqlite-search-store.js";

runSearchStoreContractTests("SqliteSearchStore", () => new SqliteSearchStore(":memory:"));
