export interface EngineCapabilities {
  memory: boolean;
  search: boolean;
  vector: boolean;
  graph: boolean;
  cache: boolean;
  blob: boolean;
  versioning: boolean;
  provenance: boolean;
  transactions: boolean;
  /** Whether a ConflictStore is configured, enabling engine.ingest()'s conflict outcome and engine.resolveConflict(). */
  conflictResolution: boolean;
}
