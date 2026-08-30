import type { MemoryProvenance } from "@memorie/types";

export interface ProvenanceStore {
  record(provenance: MemoryProvenance): Promise<void>;
  list(memoryId: string): Promise<MemoryProvenance[]>;
  deleteAll(memoryId: string): Promise<void>;
}
