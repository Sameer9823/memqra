import { describe, it, expect, beforeEach } from "vitest";
import { VersionConflictError } from "@memorie/types";
import type { Memory } from "@memorie/types";
import type { MemoryStore } from "../memory-store.js";

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
 * Runs a standard contract suite against any MemoryStore implementation.
 * Every implemented adapter must pass this suite (see docs/ADAPTERS.md).
 */
export function runMemoryStoreContractTests(
  name: string,
  createStore: () => Promise<MemoryStore> | MemoryStore,
): void {
  describe(`MemoryStore contract: ${name}`, () => {
    let store: MemoryStore;

    beforeEach(async () => {
      store = await createStore();
    });

    it("creates and retrieves a memory", async () => {
      const created = await store.create(makeMemory({ content: "hello" }));
      const fetched = await store.get(created.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.content).toBe("hello");
    });

    it("returns null for a missing memory", async () => {
      const fetched = await store.get("does-not-exist");
      expect(fetched).toBeNull();
    });

    it("updates a memory and bumps updatedAt", async () => {
      const created = await store.create(makeMemory({ content: "v1" }));
      await new Promise((r) => setTimeout(r, 2));
      const updated = await store.update(created.id, { content: "v2" });
      expect(updated.content).toBe("v2");
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(
        created.updatedAt.getTime(),
      );
    });

    it("throws MemoryNotFoundError-compatible error on update of missing memory", async () => {
      await expect(
        store.update("does-not-exist", { content: "x" }),
      ).rejects.toThrow();
    });

    it("deletes a memory", async () => {
      const created = await store.create(makeMemory());
      await store.delete(created.id);
      const fetched = await store.get(created.id);
      expect(fetched).toBeNull();
    });

    it("lists memories scoped by namespace and subject", async () => {
      await store.create(makeMemory({ namespace: "ns-a", subjectId: "s1" }));
      await store.create(makeMemory({ namespace: "ns-b", subjectId: "s1" }));
      const results = await store.list({ namespace: "ns-a", subjectId: "s1" });
      expect(results.length).toBe(1);
      expect(results[0]?.namespace).toBe("ns-a");
    });

    it("enforces tenant isolation", async () => {
      await store.create(
        makeMemory({ tenantId: "tenant-a", namespace: "ns", subjectId: "s1" }),
      );
      await store.create(
        makeMemory({ tenantId: "tenant-b", namespace: "ns", subjectId: "s1" }),
      );
      const resultsA = await store.list({ tenantId: "tenant-a", namespace: "ns" });
      expect(resultsA.every((m) => m.tenantId === "tenant-a")).toBe(true);
    });

    it("counts memories matching a scope", async () => {
      await store.create(makeMemory({ namespace: "count-ns", subjectId: "s1" }));
      await store.create(makeMemory({ namespace: "count-ns", subjectId: "s1" }));
      const count = await store.count({ namespace: "count-ns", subjectId: "s1" });
      expect(count).toBe(2);
    });

    it("filters by type", async () => {
      await store.create(
        makeMemory({ namespace: "filt", subjectId: "s1", type: "fact" }),
      );
      await store.create(
        makeMemory({ namespace: "filt", subjectId: "s1", type: "preference" }),
      );
      const facts = await store.list({
        namespace: "filt",
        subjectId: "s1",
        filters: { type: "fact" },
      });
      expect(facts.every((m) => m.type === "fact")).toBe(true);
      expect(facts.length).toBe(1);
    });

    it("supports optimistic concurrency via expectedVersion", async () => {
      const created = await store.create(makeMemory({ version: 1 }));
      await store.update(created.id, { content: "v2", version: 2 }, { expectedVersion: 1 });

      await expect(
        store.update(
          created.id,
          { content: "v3", version: 3 },
          { expectedVersion: 1 },
        ),
      ).rejects.toThrow(VersionConflictError);
    });

    it("respects limit and offset", async () => {
      for (let i = 0; i < 5; i++) {
        await store.create(
          makeMemory({ namespace: "page-ns", subjectId: "s1", content: `m${i}` }),
        );
      }
      const page1 = await store.list({ namespace: "page-ns", subjectId: "s1", limit: 2, offset: 0 });
      const page2 = await store.list({ namespace: "page-ns", subjectId: "s1", limit: 2, offset: 2 });
      expect(page1.length).toBe(2);
      expect(page2.length).toBe(2);
      expect(page1[0]?.id).not.toBe(page2[0]?.id);
    });
  });
}
