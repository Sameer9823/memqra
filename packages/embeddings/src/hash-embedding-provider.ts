import type { EmbeddingProvider } from "@memorie/types";

const DEFAULT_DIMENSIONS = 256;

function fnv1a(str: string, seed: number): number {
  let hash = 0x811c9dc5 ^ seed;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // Force unsigned 32-bit.
  return hash >>> 0;
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

/**
 * A deterministic, dependency-free bag-of-words embedding using the
 * hashing trick (each token hashes to a dimension index, with a second
 * hash choosing +1/-1 to reduce collision bias), L2-normalized.
 *
 * This is intentionally NOT a semantic embedding model — it captures
 * lexical overlap, not meaning. It exists so Memorie's vector-search path
 * (VectorStore, hybrid "semantic" signal) is exercisable and testable
 * with zero AI vendor dependency and zero network calls (spec section 19,
 * "AI independence"). For production semantic search, configure a real
 * EmbeddingProvider backed by an actual embedding model — implementing
 * one is explicitly out of scope for the core (see docs/ARCHITECTURE.md).
 */
export class HashEmbeddingProvider implements EmbeddingProvider {
  private readonly dimensions: number;

  constructor(dimensions: number = DEFAULT_DIMENSIONS) {
    if (dimensions <= 0) {
      throw new RangeError("dimensions must be positive");
    }
    this.dimensions = dimensions;
  }

  async embed(input: string): Promise<number[]> {
    const vector = new Array<number>(this.dimensions).fill(0);
    for (const token of tokenize(input)) {
      const index = fnv1a(token, 0) % this.dimensions;
      const sign = fnv1a(token, 1) % 2 === 0 ? 1 : -1;
      vector[index] = (vector[index] ?? 0) + sign;
    }
    return normalize(vector);
  }

  async embedBatch(inputs: string[]): Promise<number[][]> {
    return Promise.all(inputs.map((input) => this.embed(input)));
  }
}

function normalize(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (magnitude === 0) return vector;
  return vector.map((v) => v / magnitude);
}
