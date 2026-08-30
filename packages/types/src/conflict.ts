export type ConflictStatus = "open" | "resolved";

export type ConflictResolutionStrategy =
  | "latest"
  | "highest-confidence"
  | "highest-importance"
  | "manual"
  | "merge"
  | "supersede";

export interface MemoryConflict {
  readonly id: string;
  readonly memoryA: string;
  readonly memoryB: string;
  /** Caller/engine-defined conflict category, e.g. "value-mismatch". */
  readonly type: string;
  /** Confidence that this is a genuine conflict (vs. a false positive). */
  confidence: number;
  status: ConflictStatus;
  resolution?: ConflictResolutionStrategy;
  /** id of the memory that "won" once resolved, if applicable. */
  resolvedMemoryId?: string;
  readonly createdAt: Date;
  resolvedAt?: Date;
}
