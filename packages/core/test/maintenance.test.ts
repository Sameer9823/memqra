import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryStore, InMemoryVersionStore } from "@memorie/storage-memory";
import { InMemoryVectorStore } from "@memorie/vector-memory";
import { HashEmbeddingProvider } from "@memorie/embeddings";
import { createMemoryEngine, type MemoryEngine } from "../src/engine.js";

/** A minimal SearchStore that also implements the optional listIds(). */
class ListableSearchStore {
  indexed = new Map<string, unknown>();
  async index(memory: { id: string }) {
    this.indexed.set(memory.id, memory);
  }
  async delete(id: string) {
    this.indexed.delete(id);
  }
  async search() {
    return [];
  }
  async listIds() {
    return [...this.indexed.keys()];
  }
}

function makeEngine(): {
  engine: MemoryEngine;
  memoryStore: InMemoryStore;
  searchStore: ListableSearchStore;
  vectorStore: InMemoryVectorStore;
} {
  const memoryStore = new InMemoryStore();
  const searchStore = new ListableSearchStore();
  const vectorStore = new InMemoryVectorStore();
  const engine = createMemoryEngine({
    memoryStore,
    versionStore: new InMemoryVersionStore(),
    searchStore,
    vectorStore,
    embeddingProvider: new HashEmbeddingProvider(),
  });
  return { engine, memoryStore, searchStore, vectorStore };
}

describe("MemoryEngine reindex()/reconcile() (Phase 7)", () => {
  let engine: MemoryEngine;
  let memoryStore: InMemoryStore;
  let searchStore: ListableSearchStore;
  let vectorStore: InMemoryVectorStore;

  beforeEach(() => {
    ({ engine, memoryStore, searchStore, vectorStore } = makeEngine());
  });

  it("reindex() rebuilds search and vector projections from canonical data", async () => {
    const memories = await Promise.all(
      Array.from({ length: 3 }, (_, i) =>
        engine.add({ namespace: "users", subjectId: "u1", type: "fact", content: `fact ${i}` }),
      ),
    );

    // Simulate drift: wipe the projections without going through the engine.
    searchStore.indexed.clear();
    vectorStore.clear();

    const report = await engine.reindex();
    expect(report.searchReindexed).toBe(3);
    expect(report.vectorReindexed).toBe(3);
    for (const m of memories) {
      expect(searchStore.indexed.has(m.id)).toBe(true);
    }
  });

  it("reconcile() reports missing entries without repairing by default", async () => {
    const memory = await engine.add({ namespace: "users", subjectId: "u1", type: "fact", content: "hi" });
    searchStore.indexed.clear(); // now "missing" from search

    const report = await engine.reconcile();
    expect(report.checked).toBe(1);
    expect(report.issues).toContainEqual({ store: "search", type: "missing", memoryId: memory.id });
    expect(report.repaired).toBeUndefined();
    // Not repaired: still missing after the report-only call.
    expect(searchStore.indexed.has(memory.id)).toBe(false);
  });

  it("reconcile({ repair: true }) fixes missing entries", async () => {
    const memory = await engine.add({ namespace: "users", subjectId: "u1", type: "fact", content: "hi" });
    searchStore.indexed.clear();

    const report = await engine.reconcile({ repair: true });
    expect(report.issues.some((i) => i.type === "missing" && i.memoryId === memory.id)).toBe(true);
    expect(report.repaired).toBeGreaterThanOrEqual(1);
    expect(searchStore.indexed.has(memory.id)).toBe(true);
  });

  it("reconcile() reports orphaned entries (present in a projection, gone from canonical)", async () => {
    const memory = await engine.add({ namespace: "users", subjectId: "u1", type: "fact", content: "hi" });
    await memoryStore.delete(memory.id); // bypass engine.delete(), so search/vector still have it

    const report = await engine.reconcile();
    expect(report.issues).toContainEqual({ store: "search", type: "orphaned", memoryId: memory.id });
    expect(report.issues).toContainEqual({ store: "vector", type: "orphaned", memoryId: memory.id });
  });

  it("reconcile({ repair: true }) removes orphaned entries", async () => {
    const memory = await engine.add({ namespace: "users", subjectId: "u1", type: "fact", content: "hi" });
    await memoryStore.delete(memory.id);

    await engine.reconcile({ repair: true });
    expect(searchStore.indexed.has(memory.id)).toBe(false);
    const remainingIds = await vectorStore.listIds();
    expect(remainingIds).not.toContain(memory.id);
  });

  it("reconcile({ stores: ['search'] }) only checks the requested store", async () => {
    const memory = await engine.add({ namespace: "users", subjectId: "u1", type: "fact", content: "hi" });
    searchStore.indexed.clear();
    vectorStore.clear();

    const report = await engine.reconcile({ stores: ["search"] });
    expect(report.issues.every((i) => i.store === "search")).toBe(true);
    expect(report.issues.some((i) => i.memoryId === memory.id)).toBe(true);
  });

  it("reconcile() skips a store that doesn't implement listIds()", async () => {
    const engineNoListIds = createMemoryEngine({
      memoryStore: new InMemoryStore(),
      searchStore: {
        index: async () => undefined,
        delete: async () => undefined,
        search: async () => [],
        // no listIds()
      },
    });
    const report = await engineNoListIds.reconcile();
    expect(report.issues).toEqual([]);
  });
});
