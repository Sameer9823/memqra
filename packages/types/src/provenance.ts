/**
 * Provenance answers: where did this memory come from, when, and on what
 * evidence? It is intentionally optional and stored separately from the
 * memory content so provenance-heavy applications (audit, compliance)
 * don't force cost onto applications that don't need it.
 */

export interface EvidenceReference {
  /** What kind of evidence this is, e.g. "message", "document", "observation". */
  type: string;
  /** Opaque identifier/pointer into the source system, if applicable. */
  refId?: string;
  /** Optional short excerpt or description. Not intended for large payloads. */
  excerpt?: string;
}

export interface MemoryProvenance {
  readonly memoryId: string;
  readonly version: number;

  /** Where this memory came from, e.g. "user", "import", "inference", "application". */
  sourceType: string;

  /** Opaque identifier for the source record/system, if applicable. */
  sourceId?: string;

  /** Who/what produced this memory (a user id, agent id, system id, etc.). */
  actorId?: string;

  readonly createdAt: Date;

  /** Confidence attributed to this specific provenance record (may differ from Memory.confidence). */
  confidence?: number;

  evidence?: EvidenceReference[];

  metadata?: Record<string, unknown>;
}

/** Configurable reliability score for a given sourceType. Policy, not hard-coded. */
export interface SourceReliabilityPolicy {
  (sourceType: string): number;
}
