import { runMemoryStoreContractTests } from "@memorie/storage/contract-tests";
import { InMemoryStore } from "../src/in-memory-store.js";

runMemoryStoreContractTests("InMemoryStore", () => new InMemoryStore());
