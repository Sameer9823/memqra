import { runVectorStoreContractTests } from "@memorie/storage/contract-tests";
import { InMemoryVectorStore } from "../src/in-memory-vector-store.js";

runVectorStoreContractTests("InMemoryVectorStore", () => new InMemoryVectorStore());
