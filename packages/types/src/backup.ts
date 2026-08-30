import type { Memory, MemoryVersion } from "./memory.js";
import type { MemoryRelation } from "./relations.js";
import type { MemoryConflict } from "./conflict.js";

/**
 * Portable snapshot format for export()/import() (spec section 51-53).
 * JSON-shaped by default; for JSONL, serialize `memories` (and any
 * included `versions`/`relations`/`conflicts`) one record per line —
 * `data.memories.map(m => JSON.stringify(m)).join("\n")` and the
 * reverse for import. No separate JSONL codec is needed since the
 * mapping is direct.
 */
export interface MemoryExport {
  /** Export format version, for forward compatibility. */
  version: 1;
  exportedAt: string;
  memories: Memory[];
  versions?: MemoryVersion[];
  relations?: MemoryRelation[];
  conflicts?: MemoryConflict[];
}

export interface ExportOptions {
  tenantId?: string;
  namespace?: string;
  subjectId?: string;
  /** Include full version history for each exported memory. Requires a VersionStore. */
  includeVersions?: boolean;
  /** Include relations where either endpoint is an exported memory. Requires a GraphStore with listIds() support — see docs/ADAPTERS.md. */
  includeRelations?: boolean;
  /** Include open/resolved conflicts referencing an exported memory. Requires a ConflictStore. */
  includeConflicts?: boolean;
}

export interface ImportOptions {
  /** What to do when an imported memory's id already exists. Defaults to "skip". */
  onConflict?: "skip" | "overwrite";
}

export interface ImportResult {
  imported: number;
  skipped: number;
  versionsImported: number;
  relationsImported: number;
  conflictsImported: number;
}
