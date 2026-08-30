import { describe, it, expect } from "vitest";
import { HashEmbeddingProvider } from "../src/hash-embedding-provider.js";

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += (a[i] ?? 0) * (b[i] ?? 0);
  return dot; // both vectors are already L2-normalized
}

describe("HashEmbeddingProvider", () => {
  it("produces a normalized vector of the configured dimensionality", async () => {
    const provider = new HashEmbeddingProvider(64);
    const vector = await provider.embed("hello world");
    expect(vector.length).toBe(64);
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    expect(magnitude).toBeCloseTo(1, 5);
  });

  it("is deterministic", async () => {
    const provider = new HashEmbeddingProvider();
    const a = await provider.embed("The quick brown fox");
    const b = await provider.embed("The quick brown fox");
    expect(a).toEqual(b);
  });

  it("gives higher similarity to lexically related text than unrelated text", async () => {
    const provider = new HashEmbeddingProvider();
    const base = await provider.embed("revenue growth in the third quarter");
    const related = await provider.embed("quarterly revenue and growth figures");
    const unrelated = await provider.embed("a recipe for banana bread");

    expect(cosine(base, related)).toBeGreaterThan(cosine(base, unrelated));
  });

  it("embedBatch matches embed applied individually", async () => {
    const provider = new HashEmbeddingProvider(32);
    const inputs = ["alpha beta", "gamma delta"];
    const batch = await provider.embedBatch(inputs);
    const individual = await Promise.all(inputs.map((i) => provider.embed(i)));
    expect(batch).toEqual(individual);
  });

  it("rejects non-positive dimensions", () => {
    expect(() => new HashEmbeddingProvider(0)).toThrow(RangeError);
    expect(() => new HashEmbeddingProvider(-5)).toThrow(RangeError);
  });
});
