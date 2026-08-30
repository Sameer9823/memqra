import { runGraphStoreContractTests } from "@memorie/storage/contract-tests";
import type { Memory } from "@memorie/types";
import { InMemoryGraphStore } from "../src/in-memory-graph-store.js";

runGraphStoreContractTests("InMemoryGraphStore", () => {
  const memories = new Map<string, Memory>();
  const store = new InMemoryGraphStore((id) => memories.get(id) ?? null);
  return {
    store,
    putMemory: (memory) => {
      memories.set(memory.id, memory);
    },
  };
});
