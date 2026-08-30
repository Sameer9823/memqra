import { runConflictStoreContractTests } from "@memorie/storage/contract-tests";
import { InMemoryConflictStore } from "../src/in-memory-conflict-store.js";

runConflictStoreContractTests("InMemoryConflictStore", () => new InMemoryConflictStore());
