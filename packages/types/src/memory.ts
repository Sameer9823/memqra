/**
 * Core memory model.
 *
 * Design note (see docs/ARCHITECTURE.md): a Memory deliberately separates
 * five concerns that most "AI memory" libraries collapse into one blob:
 *
 *   - Identity      -> id, tenantId, namespace, subjectId, type
 *   - State         -> lifecycle state + version number
 *   - Representation -> content + metadata (the canonical payload)
 *   - Scoring       -> importance, confidence
 *   - Bookkeeping   -> timestamps, access stats, expiry
 *
 * Provenance and relationships are modeled as separate entities
 * (see provenance.ts, relations.ts) rather than inlined here, because
 * they have their own lifecycle and are frequently stored/queried
 * independently of the memory content itself.
 */

/** Lifecycle states a memory can occupy. See docs/MEMORY-LIFECYCLE.md. */
export type MemoryState =
  | "active"
  | "updated"
  | "superseded"
  | "merged"
  | "archived"
  | "expired"
  | "deleted";

/**
 * A namespace-scoped, subject-scoped unit of memory.
 *
 * `subjectId` is deliberately generic (not `userId`) because a memory may
 * belong to a user, a project, an organization, a device, a document, or
 * any other application-defined entity.
 */
export interface Memory {
  /** Stable identity of this memory across all of its versions. */
  readonly id: string;

  /** Optional tenant scope. When set, all operations must be tenant-isolated. */
  readonly tenantId?: string;

  /** Logical grouping, e.g. "users", "projects", "devices". Meaning is caller-defined. */
  readonly namespace: string;

  /** The entity this memory is about/belongs to. Caller-defined meaning. */
  readonly subjectId: string;

  /** Caller-defined memory type/category, e.g. "fact", "preference", "event". */
  readonly type: string;

  /** Canonical textual content of this memory version. */
  content: string;

  /** Current lifecycle state. */
  state: MemoryState;

  /** 0.0 - 1.0 subjective importance score. */
  importance: number;

  /** 0.0 - 1.0 confidence that this memory is accurate. */
  confidence: number;

  /** Free-form, caller-defined source label (see also MemoryProvenance for structured provenance). */
  source?: string;

  /** Arbitrary structured metadata. Not interpreted by the core. */
  metadata: Record<string, unknown>;

  readonly createdAt: Date;
  updatedAt: Date;
  lastAccessedAt?: Date;
  accessCount: number;

  /** Optional expiration. null/undefined means "never expires". */
  expiresAt?: Date | null;

  /** Monotonically increasing version number for this memory's identity. */
  version: number;

  /** If this memory was superseded, the id of the memory that replaced it. */
  supersededBy?: string;

  /** If this memory supersedes another, the id of the memory it replaced. */
  supersedes?: string;

  /** If this memory resulted from a merge/consolidation, the source memory ids. */
  mergedFrom?: string[];
}

/** Fields a caller may set when creating a new memory. Identity/bookkeeping are engine-managed. */
export type NewMemoryInput = {
  tenantId?: string;
  namespace: string;
  subjectId: string;
  type: string;
  content: string;
  importance?: number;
  confidence?: number;
  source?: string;
  metadata?: Record<string, unknown>;
  expiresAt?: Date | null;
  /** Client-supplied idempotency key. Retrying with the same key must not create a duplicate. */
  operationId?: string;
};

/** Fields a caller may patch on an existing memory. */
export type MemoryPatch = Partial<
  Pick<
    Memory,
    | "content"
    | "importance"
    | "confidence"
    | "source"
    | "metadata"
    | "expiresAt"
    | "state"
  >
>;

/**
 * An immutable historical snapshot of a memory at a specific version.
 * Distinct from `Memory` (the current/mutable state) to make clear that
 * versions are read-only and must never be written through the normal
 * MemoryStore.update() path.
 */
export interface MemoryVersion {
  readonly memoryId: string;
  readonly version: number;
  readonly snapshot: Memory;
  readonly changeType: MemoryChangeType;
  readonly createdAt: Date;
  /** Optional human/agent-readable reason for the change. */
  readonly reason?: string;
}

export type MemoryChangeType =
  | "created"
  | "updated"
  | "superseded"
  | "merged"
  | "archived"
  | "expired"
  | "deleted";
