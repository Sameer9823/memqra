import { describe, it, expect, beforeEach } from "vitest";
import type { VectorStore } from "../secondary-stores.js";

function unitVector(dims: number, index: number): number[] {
  const v = new Array<number>(dims).fill(0);
  v[index] = 1;
  return v;
}

/**
 * Runs a standard contract suite against any VectorStore implementation.
 * Every implemented adapter must pass this suite.
 *
 * Score contract: search() must return scores in [0, 1] where 1.0 means
 * "identical direction" (cosine similarity 1.0) so scores compose
 * predictably with other [0, 1] signals in the core hybrid pipeline
 * (see docs/SEARCH.md).
 */
export function runVectorStoreContractTests(
  name: string,
  createStore: () => Promise<VectorStore> | VectorStore,
): void {
  describe(`VectorStore contract: ${name}`, () => {
    let store: VectorStore;

    beforeEach(async () => {
      store = await createStore();
    });

    it("upserts and finds the nearest neighbor", async () => {
      await store.upsert("a", unitVector(4, 0));
      await store.upsert("b", unitVector(4, 1));
      await store.upsert("c", unitVector(4, 2));

      const results = await store.search(unitVector(4, 0), { topK: 1 });
      expect(results[0]?.id).toBe("a");
    });

    it("ranks by similarity, closest first", async () => {
      await store.upsert("exact", [1, 0, 0, 0]);
      await store.upsert("close", [0.9, 0.1, 0, 0]);
      await store.upsert("far", [0, 1, 0, 0]);

      const results = await store.search([1, 0, 0, 0], { topK: 3 });
      const order = results.map((r) => r.id);
      expect(order.indexOf("exact")).toBeLessThan(order.indexOf("close"));
      expect(order.indexOf("close")).toBeLessThan(order.indexOf("far"));
    });

    it("respects topK", async () => {
      for (let i = 0; i < 5; i++) {
        await store.upsert(`item-${i}`, unitVector(5, i));
      }
      const results = await store.search(unitVector(5, 0), { topK: 2 });
      expect(results.length).toBe(2);
    });

    it("returns scores within [0, 1]", async () => {
      await store.upsert("a", [1, 0]);
      await store.upsert("b", [-1, 0]);
      const results = await store.search([1, 0], { topK: 2 });
      for (const r of results) {
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(1);
      }
    });

    it("deletes an entry so it no longer matches", async () => {
      await store.upsert("gone", unitVector(3, 0));
      await store.delete("gone");
      const results = await store.search(unitVector(3, 0), { topK: 5 });
      expect(results.some((r) => r.id === "gone")).toBe(false);
    });

    it("re-upserting the same id replaces rather than duplicates", async () => {
      await store.upsert("x", unitVector(3, 0));
      await store.upsert("x", unitVector(3, 1));
      const results = await store.search(unitVector(3, 1), { topK: 5 });
      const matches = results.filter((r) => r.id === "x");
      expect(matches.length).toBe(1);
    });
  });
}
