import { Pool } from "pg";
import { runMemoryStoreContractTests } from "@memorie/storage/contract-tests";
import { PostgresStore } from "../src/postgres-store.js";

const connectionString =
  process.env.MEMORIE_TEST_POSTGRES_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/memorie_test";

const pool = new Pool({ connectionString });

runMemoryStoreContractTests("PostgresStore", async () => {
  const store = new PostgresStore(pool);
  await store.init();
  // Contract tests expect a clean store each run.
  await pool.query("TRUNCATE memories, memory_versions");
  return store;
});
