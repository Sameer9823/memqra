/**
 * Relationship types are extensible strings rather than a closed enum so
 * applications can define domain-specific relations without forking the
 * core. A small set of well-known values is provided for convenience.
 */
export type WellKnownRelationType =
  | "supports"
  | "contradicts"
  | "supersedes"
  | "derived_from"
  | "related_to"
  | "depends_on"
  | "caused_by";

export type RelationType = WellKnownRelationType | (string & {});

export interface MemoryRelation {
  readonly id: string;
  readonly fromMemoryId: string;
  readonly toMemoryId: string;
  readonly type: RelationType;
  /** Optional relationship strength/weight, e.g. for ranking or traversal pruning. */
  weight?: number;
  metadata?: Record<string, unknown>;
  readonly createdAt: Date;
}

export interface GraphQueryOptions {
  types?: RelationType[];
  direction?: "outgoing" | "incoming" | "both";
  limit?: number;
  minWeight?: number;
}

export interface TraversalOptions extends GraphQueryOptions {
  maxDepth?: number;
}
