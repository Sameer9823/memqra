export type ReconciledStore = "search" | "vector";
export type ReconciliationIssueType = "missing" | "orphaned";

export interface ReconciliationIssue {
  store: ReconciledStore;
  type: ReconciliationIssueType;
  memoryId: string;
}

export interface ReconciliationReport {
  /** Number of canonical memories checked. */
  checked: number;
  issues: ReconciliationIssue[];
  /** Set when `repair: true` was passed — how many issues were fixed. */
  repaired?: number;
}

export interface ReconcileOptions {
  /** Restrict which projections to check. Defaults to whichever are configured. */
  stores?: ReconciledStore[];
  /** Re-index missing entries and delete orphaned ones. Defaults to false (report only). */
  repair?: boolean;
}

export interface ReindexOptions {
  search?: boolean;
  vector?: boolean;
}

export interface ReindexReport {
  searchReindexed: number;
  vectorReindexed: number;
}
