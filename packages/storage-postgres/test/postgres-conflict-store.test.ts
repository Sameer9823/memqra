import { Pool } from "pg";
import { runConflictStoreContractTests } from "@memorie/storage/contract-tests";
import { PostgresConflictStore } from "../src/postgres-conflict-store.js";

const connectionString =
  process.env.MEMORIE_TEST_POSTGRES_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/memorie_test";

const pool = new Pool({ connectionString });

runConflictStoreContractTests("PostgresConflictStore", async () => {
  const store = new PostgresConflictStore(pool);
  await store.init();
  await pool.query("TRUNCATE memory_conflicts");
  return store;
});
