import type { Memory } from "./memory.js";

/**
 * Optional. The core engine has zero mandatory dependency on any AI
 * vendor or embedding model. Provide an implementation only if you want
 * semantic/vector search.
 */
export interface EmbeddingProvider {
  embed(input: string): Promise<number[]>;
  embedBatch(inputs: string[]): Promise<number[][]>;
}

export interface MemoryCandidate {
  content: string;
  type?: string;
  importance?: number;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

export interface MemoryClassification {
  type: string;
  confidence: number;
}

export type ComparisonRelation =
  | "same"
  | "duplicate"
  | "updates"
  | "contradicts"
  | "unrelated";

export interface MemoryComparison {
  relation: ComparisonRelation;
  confidence: number;
  explanation?: string;
}

/**
 * Optional. Enables extraction/classification/comparison/consolidation
 * of memories using an AI model. The core must function fully without
 * this configured (see docs/ARCHITECTURE.md, "graceful degradation").
 */
export interface MemoryIntelligenceProvider {
  extract(input: unknown): Promise<MemoryCandidate[]>;
  classify(input: unknown): Promise<MemoryClassification>;
  compare(a: Memory, b: Memory): Promise<MemoryComparison>;
  consolidate(memories: Memory[]): Promise<Memory>;
}
