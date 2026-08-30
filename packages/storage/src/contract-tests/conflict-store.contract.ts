import { describe, it, expect, beforeEach } from "vitest";
import type { MemoryConflict } from "@memorie/types";
import type { ConflictStore } from "../conflict-store.js";

function makeConflict(overrides: Partial<MemoryConflict> = {}): MemoryConflict {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    memoryA: overrides.memoryA ?? "memory-a",
    memoryB: overrides.memoryB ?? "memory-b",
    type: overrides.type ?? "value-mismatch",
    confidence: overrides.confidence ?? 0.8,
    status: overrides.status ?? "open",
    resolution: overrides.resolution,
    resolvedMemoryId: overrides.resolvedMemoryId,
    createdAt: overrides.createdAt ?? new Date(),
    resolvedAt: overrides.resolvedAt,
  };
}

/**
 * Runs a standard contract suite against any ConflictStore implementation.
 * Every implemented ConflictStore adapter must pass this suite.
 */
export function runConflictStoreContractTests(
  name: string,
  createStore: () => Promise<ConflictStore> | ConflictStore,
): void {
  describe(`ConflictStore contract: ${name}`, () => {
    let store: ConflictStore;

    beforeEach(async () => {
      store = await createStore();
    });

    it("records and retrieves a conflict by id", async () => {
      const conflict = makeConflict();
      await store.record(conflict);

      const found = await store.get(conflict.id);
      expect(found).not.toBeNull();
      expect(found?.memoryA).toBe(conflict.memoryA);
      expect(found?.memoryB).toBe(conflict.memoryB);
      expect(found?.status).toBe("open");
    });

    it("returns null for an unknown conflict id", async () => {
      const found = await store.get("does-not-exist");
      expect(found).toBeNull();
    });

    it("lists conflicts touching a given memory, in either position", async () => {
      const c1 = makeConflict({ memoryA: "shared", memoryB: "other-1" });
      const c2 = makeConflict({ memoryA: "other-2", memoryB: "shared" });
      const c3 = makeConflict({ memoryA: "unrelated-1", memoryB: "unrelated-2" });
      await store.record(c1);
      await store.record(c2);
      await store.record(c3);

      const results = await store.list({ memoryId: "shared" });
      const ids = results.map((c) => c.id);
      expect(ids).toContain(c1.id);
      expect(ids).toContain(c2.id);
      expect(ids).not.toContain(c3.id);
    });

    it("filters by status", async () => {
      const open = makeConflict({ status: "open" });
      const resolved = makeConflict({ status: "resolved", resolution: "latest", resolvedMemoryId: "memory-b" });
      await store.record(open);
      await store.record(resolved);

      const openResults = await store.list({ status: "open" });
      expect(openResults.some((c) => c.id === open.id)).toBe(true);
      expect(openResults.some((c) => c.id === resolved.id)).toBe(false);
    });

    it("resolve() updates status, resolution, resolvedMemoryId and resolvedAt", async () => {
      const conflict = makeConflict();
      await store.record(conflict);

      const resolvedAt = new Date();
      const resolved = await store.resolve(conflict.id, "highest-confidence", conflict.memoryB, resolvedAt);

      expect(resolved.status).toBe("resolved");
      expect(resolved.resolution).toBe("highest-confidence");
      expect(resolved.resolvedMemoryId).toBe(conflict.memoryB);
      expect(resolved.resolvedAt?.getTime()).toBe(resolvedAt.getTime());

      const fetched = await store.get(conflict.id);
      expect(fetched?.status).toBe("resolved");
    });
  });
}
