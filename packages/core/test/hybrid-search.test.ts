import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryStore, InMemoryVersionStore } from "@memorie/storage-memory";
import { SqliteSearchStore } from "@memorie/search-sqlite";
import { InMemoryVectorStore } from "@memorie/vector-memory";
import { HashEmbeddingProvider } from "@memorie/embeddings";
import { createMemoryEngine, type MemoryEngine } from "../src/engine.js";

describe("MemoryEngine.search() — hybrid pipeline", () => {
  describe("without a SearchStore (fallback path)", () => {
    let engine: MemoryEngine;

    beforeEach(() => {
      engine = createMemoryEngine({
        memoryStore: new InMemoryStore(),
        versionStore: new InMemoryVersionStore(),
      });
    });

    it("ranks keyword matches above non-matches", async () => {
      await engine.add({ namespace: "ns", subjectId: "s1", type: "fact", content: "TypeScript is great for large codebases" });
      await engine.add({ namespace: "ns", subjectId: "s1", type: "fact", content: "Bananas are a good source of potassium" });

      const results = await engine.search({ namespace: "ns", subjectId: "s1", query: "typescript" });
      expect(results[0]?.memory.content).toContain("TypeScript");
      expect(results[0]?.matchedSignals).toContain("keyword");
    });

    it("still returns results for a filters-only query with no free text", async () => {
      await engine.add({ namespace: "ns", subjectId: "s1", type: "fact", content: "a", importance: 0.9 });
      await engine.add({ namespace: "ns", subjectId: "s1", type: "preference", content: "b", importance: 0.2 });

      const results = await engine.search({
        namespace: "ns",
        subjectId: "s1",
        filters: { type: "fact" },
      });
      expect(results.length).toBe(1);
      expect(results[0]?.memory.type).toBe("fact");
    });

    it("respects limit and offset", async () => {
      for (let i = 0; i < 5; i++) {
        await engine.add({ namespace: "page-ns", subjectId: "s1", type: "fact", content: `memory number ${i}` });
      }
      const page1 = await engine.search({ namespace: "page-ns", subjectId: "s1", query: "memory", limit: 2, offset: 0 });
      const page2 = await engine.search({ namespace: "page-ns", subjectId: "s1", query: "memory", limit: 2, offset: 2 });
      expect(page1.length).toBe(2);
      expect(page2.length).toBe(2);
      expect(page1[0]?.memory.id).not.toBe(page2[0]?.memory.id);
    });
  });

  describe("with a SearchStore configured", () => {
    let engine: MemoryEngine;
    let searchStore: SqliteSearchStore;

    beforeEach(() => {
      searchStore = new SqliteSearchStore(":memory:");
      engine = createMemoryEngine({
        memoryStore: new InMemoryStore(),
        versionStore: new InMemoryVersionStore(),
        searchStore,
      });
    });

    it("reports the search capability and uses the configured store for keyword relevance", async () => {
      await engine.add({
        namespace: "ns",
        subjectId: "s1",
        type: "fact",
        content: "The quarterly revenue report shows strong growth across all regions.",
      });
      await engine.add({
        namespace: "ns",
        subjectId: "s1",
        type: "fact",
        content: "Completely unrelated content about a garden full of tomatoes.",
      });

      const results = await engine.search({ namespace: "ns", subjectId: "s1", query: "revenue growth" });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.memory.content).toContain("revenue");
      expect(results[0]?.matchedSignals).toContain("keyword");
    });

    it("still enforces tenant isolation through the merge/rank pipeline", async () => {
      await engine.add({ tenantId: "a", namespace: "ns", subjectId: "s1", type: "fact", content: "shared apple keyword" });
      await engine.add({ tenantId: "b", namespace: "ns", subjectId: "s1", type: "fact", content: "shared apple keyword" });

      const results = await engine.search({ tenantId: "a", namespace: "ns", subjectId: "s1", query: "apple" });
      expect(results.every((r) => r.memory.tenantId === "a")).toBe(true);
    });

    it("keeps canonical content authoritative even though the SearchStore has its own snapshot", async () => {
      const memory = await engine.add({ namespace: "ns", subjectId: "s1", type: "fact", content: "original wording about oranges" });
      await engine.update(memory.id, { content: "updated wording about oranges and mangoes" });

      const results = await engine.search({ namespace: "ns", subjectId: "s1", query: "mangoes" });
      expect(results[0]?.memory.content).toBe("updated wording about oranges and mangoes");
    });
  });

  describe("with a VectorStore + EmbeddingProvider configured (semantic signal)", () => {
    let engine: MemoryEngine;

    beforeEach(() => {
      engine = createMemoryEngine({
        memoryStore: new InMemoryStore(),
        versionStore: new InMemoryVersionStore(),
        vectorStore: new InMemoryVectorStore(),
        embeddingProvider: new HashEmbeddingProvider(),
      });
    });

    it("reports the vector capability", () => {
      expect(engine.capabilities().vector).toBe(true);
    });

    it("ranks lexically/semantically related content above unrelated content", async () => {
      await engine.add({ namespace: "ns", subjectId: "s1", type: "fact", content: "quarterly revenue and growth figures" });
      await engine.add({ namespace: "ns", subjectId: "s1", type: "fact", content: "a recipe for banana bread" });

      const results = await engine.search({ namespace: "ns", subjectId: "s1", query: "revenue growth" });
      expect(results[0]?.memory.content).toContain("revenue");
      expect(results[0]?.matchedSignals).toContain("semantic");
    });

    it("respects tenant isolation for semantic results outside the structural pool", async () => {
      await engine.add({ tenantId: "a", namespace: "ns", subjectId: "s1", type: "fact", content: "shared topic about apples" });
      await engine.add({ tenantId: "b", namespace: "ns", subjectId: "s1", type: "fact", content: "shared topic about apples" });

      const results = await engine.search({ tenantId: "a", namespace: "ns", subjectId: "s1", query: "apples" });
      expect(results.every((r) => r.memory.tenantId === "a")).toBe(true);
    });
  });
});
