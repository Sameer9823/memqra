import type { Memory, NewMemoryInput } from "./memory.js";
import type { MemoryConflict, ConflictResolutionStrategy } from "./conflict.js";

/**
 * Phase 4 — Memory Evolution (spec sections 7-8, 16-18).
 *
 * These interfaces let the engine automate the pipeline:
 *
 *   Incoming Information -> Identity Resolution -> New or Existing?
 *     NEW -> Create
 *     EXISTING -> Compare -> Update | Conflict | Duplicate -> Evolve
 *
 * All of them are optional and overridable. Without any configured,
 * the engine falls back to conservative, non-AI defaults documented in
 * docs/MEMORY-EVOLUTION.md — it never guesses.
 */

/** A candidate existing memory that incoming input might refer to. */
export interface IdentityMatch {
  readonly memoryId: string;
  /** 0.0-1.0 confidence that `memoryId` is the same identity as the incoming input. */
  readonly confidence: number;
  /** Short machine-readable reason, e.g. "matched metadata.key". */
  readonly reason: string;
}

/**
 * Decides whether incoming information refers to an existing memory
 * (and which one) or is genuinely new (spec section 7).
 */
export interface IdentityResolver {
  resolve(input: NewMemoryInput, candidates: Memory[]): Promise<IdentityMatch | null>;
}

export interface DuplicateVerdict {
  readonly isDuplicate: boolean;
  readonly confidence: number;
  readonly reason: string;
}

/** Configurable duplicate-detection policy (spec section 16). */
export interface DuplicateDetector {
  check(input: NewMemoryInput, existing: Memory): Promise<DuplicateVerdict>;
}

export interface ConflictVerdict {
  readonly isConflict: boolean;
  readonly confidence: number;
  /** Caller/engine-defined conflict category, e.g. "value-mismatch". */
  readonly type: string;
  readonly reason: string;
}

/** Configurable conflict-detection policy (spec section 17). */
export interface ConflictDetector {
  check(input: NewMemoryInput, existing: Memory): Promise<ConflictVerdict>;
}

export type IngestOutcome = "created" | "updated" | "duplicate" | "conflict";

/** Result of running an `ingest()` call through the evolution pipeline. */
export interface IngestResult {
  readonly outcome: IngestOutcome;
  /**
   * The memory this call produced or matched: the newly created memory
   * ("created"/"conflict"), the updated memory ("updated"), or the
   * pre-existing memory that made the input redundant ("duplicate").
   */
  readonly memory: Memory;
  /** Present when outcome is "updated": the pre-update snapshot. */
  readonly previous?: Memory;
  /** Present when outcome is "duplicate": the input that was not stored. */
  readonly skipped?: NewMemoryInput;
  /** Present when outcome is "conflict": the recorded, still-open conflict. */
  readonly conflict?: MemoryConflict;
  readonly identityMatch?: IdentityMatch;
}

/** Result of applying a resolution strategy to an open conflict. */
export interface ConflictResolutionResult {
  readonly conflict: MemoryConflict;
  readonly winner: Memory;
  readonly loser?: Memory;
  readonly strategy: ConflictResolutionStrategy;
}
