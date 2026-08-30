import type { VectorStore } from "@memorie/storage";
import type { VectorSearchOptions, VectorSearchResult } from "@memorie/types";
import { VectorStoreError } from "@memorie/types";

interface Entry {
  embedding: number[];
  metadata?: Record<string, unknown>;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new VectorStoreError(
      `Embedding dimension mismatch: ${a.length} vs ${b.length}`,
    );
  }
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    magA += av * av;
    magB += bv * bv;
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function matchesMetadataFilter(
  metadata: Record<string, unknown> | undefined,
  filter: Record<string, unknown> | undefined,
): boolean {
  if (!filter) return true;
  if (!metadata) return false;
  return Object.entries(filter).every(([key, value]) => metadata[key] === value);
}

/**
 * Brute-force, in-memory cosine-similarity VectorStore. O(n) per search —
 * fine for tests, demos, and small local datasets; not intended to scale
 * to large corpora (that's what a real vector database adapter, e.g.
 * @memorie/vector-qdrant, is for — see docs/ADAPTERS.md).
 *
 * Score contract: returns (cosineSimilarity + 1) / 2, mapping the
 * [-1, 1] cosine range into [0, 1] as required by the VectorStore
 * interface (docs/SEARCH.md).
 */
export class InMemoryVectorStore implements VectorStore {
  private readonly entries = new Map<string, Entry>();

  async upsert(
    id: string,
    embedding: number[],
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    this.entries.set(id, { embedding: [...embedding], metadata });
  }

  async search(
    embedding: number[],
    options: VectorSearchOptions = {},
  ): Promise<VectorSearchResult[]> {
    const topK = options.topK ?? 10;
    const results: VectorSearchResult[] = [];

    for (const [id, entry] of this.entries) {
      if (!matchesMetadataFilter(entry.metadata, options.filter)) continue;
      const similarity = cosineSimilarity(embedding, entry.embedding);
      const score = (similarity + 1) / 2;
      if (options.threshold !== undefined && score < options.threshold) continue;
      results.push({ id, score, metadata: entry.metadata });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  async delete(id: string): Promise<void> {
    this.entries.delete(id);
  }

  /** See VectorStore.listIds() — enables engine.reconcile() to check this store. */
  async listIds(): Promise<string[]> {
    return [...this.entries.keys()];
  }

  /** Test/debug helper. Not part of the VectorStore contract. */
  clear(): void {
    this.entries.clear();
  }
}
