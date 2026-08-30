import { describe, it, expect, beforeEach } from "vitest";
import type { Memory } from "@memorie/types";
import type { SearchStore } from "../secondary-stores.js";

function makeMemory(overrides: Partial<Memory> = {}): Memory {
  const now = new Date();
  return {
    id: overrides.id ?? crypto.randomUUID(),
    tenantId: overrides.tenantId,
    namespace: overrides.namespace ?? "test",
    subjectId: overrides.subjectId ?? "subject-1",
    type: overrides.type ?? "fact",
    content: overrides.content ?? "test content",
    state: overrides.state ?? "active",
    importance: overrides.importance ?? 0.5,
    confidence: overrides.confidence ?? 0.5,
    source: overrides.source,
    metadata: overrides.metadata ?? {},
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    lastAccessedAt: overrides.lastAccessedAt,
    accessCount: overrides.accessCount ?? 0,
    expiresAt: overrides.expiresAt ?? null,
    version: overrides.version ?? 1,
  };
}

/**
 * Runs a standard contract suite against any SearchStore implementation.
 * Every implemented SearchStore adapter must pass this suite.
 */
export function runSearchStoreContractTests(
  name: string,
  createStore: () => Promise<SearchStore> | SearchStore,
): void {
  describe(`SearchStore contract: ${name}`, () => {
    let store: SearchStore;

    beforeEach(async () => {
      store = await createStore();
    });

    it("indexes and finds a memory by keyword", async () => {
      const memory = makeMemory({
        namespace: "kw",
        subjectId: "s1",
        content: "The quarterly revenue report shows strong growth.",
      });
      await store.index(memory);

      const results = await store.search({ namespace: "kw", subjectId: "s1", query: "revenue" });
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.memory.id === memory.id)).toBe(true);
    });

    it("does not match unrelated content", async () => {
      const memory = makeMemory({
        namespace: "kw2",
        subjectId: "s1",
        content: "Completely unrelated content about gardening.",
      });
      await store.index(memory);

      const results = await store.search({ namespace: "kw2", subjectId: "s1", query: "revenue" });
      expect(results.some((r) => r.memory.id === memory.id)).toBe(false);
    });

    it("respects namespace/subject scoping", async () => {
      const memoryA = makeMemory({ namespace: "scope-a", subjectId: "s1", content: "shared keyword apples" });
      const memoryB = makeMemory({ namespace: "scope-b", subjectId: "s1", content: "shared keyword apples" });
      await store.index(memoryA);
      await store.index(memoryB);

      const results = await store.search({ namespace: "scope-a", subjectId: "s1", query: "apples" });
      expect(results.every((r) => r.memory.namespace === "scope-a")).toBe(true);
    });

    it("enforces tenant isolation", async () => {
      const memoryA = makeMemory({ tenantId: "t-a", namespace: "ns", subjectId: "s1", content: "isolated banana content" });
      const memoryB = makeMemory({ tenantId: "t-b", namespace: "ns", subjectId: "s1", content: "isolated banana content" });
      await store.index(memoryA);
      await store.index(memoryB);

      const results = await store.search({ tenantId: "t-a", namespace: "ns", subjectId: "s1", query: "banana" });
      expect(results.every((r) => r.memory.tenantId === "t-a")).toBe(true);
    });

    it("removes a memory from the index on delete", async () => {
      const memory = makeMemory({ namespace: "del-ns", subjectId: "s1", content: "deletable pineapple content" });
      await store.index(memory);
      await store.delete(memory.id);

      const results = await store.search({ namespace: "del-ns", subjectId: "s1", query: "pineapple" });
      expect(results.some((r) => r.memory.id === memory.id)).toBe(false);
    });

    it("re-indexing the same id updates rather than duplicates", async () => {
      const memory = makeMemory({ namespace: "reindex-ns", subjectId: "s1", content: "original mango content" });
      await store.index(memory);
      await store.index({ ...memory, content: "updated mango content" });

      const results = await store.search({ namespace: "reindex-ns", subjectId: "s1", query: "mango" });
      const matches = results.filter((r) => r.memory.id === memory.id);
      expect(matches.length).toBe(1);
    });

    it("returns scores in [0, 1]", async () => {
      const memory = makeMemory({ namespace: "score-ns", subjectId: "s1", content: "score test kiwi content" });
      await store.index(memory);

      const results = await store.search({ namespace: "score-ns", subjectId: "s1", query: "kiwi" });
      for (const r of results) {
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(1);
      }
    });
  });
}
