import { describe, it, expect, beforeEach } from "vitest";
import type { Memory, MemoryRelation } from "@memorie/types";
import type { GraphStore } from "../secondary-stores.js";

function makeMemory(overrides: Partial<Memory> = {}): Memory {
  const now = overrides.createdAt ?? new Date();
  return {
    id: overrides.id ?? crypto.randomUUID(),
    tenantId: overrides.tenantId,
    namespace: overrides.namespace ?? "users",
    subjectId: overrides.subjectId ?? "u1",
    type: overrides.type ?? "fact",
    content: overrides.content ?? "content",
    state: overrides.state ?? "active",
    importance: overrides.importance ?? 0.5,
    confidence: overrides.confidence ?? 0.5,
    metadata: overrides.metadata ?? {},
    createdAt: now,
    updatedAt: overrides.updatedAt ?? now,
    accessCount: overrides.accessCount ?? 0,
    version: overrides.version ?? 1,
    ...overrides,
  };
}

function makeRelation(overrides: Partial<MemoryRelation> = {}): MemoryRelation {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    fromMemoryId: overrides.fromMemoryId ?? "memory-a",
    toMemoryId: overrides.toMemoryId ?? "memory-b",
    type: overrides.type ?? "related_to",
    weight: overrides.weight,
    metadata: overrides.metadata,
    createdAt: overrides.createdAt ?? new Date(),
  };
}

/**
 * Runs a standard contract suite against any GraphStore implementation.
 * Every implemented GraphStore adapter must pass this suite. Adapters
 * must be given a way to resolve a `Memory` by id (`getMemory`) since
 * GraphStore itself is not authoritative over memory content (spec
 * section 4/22) — most real adapters store only ids/relation metadata
 * and look canonical memories up elsewhere.
 */
export function runGraphStoreContractTests(
  name: string,
  createStore: () => Promise<{ store: GraphStore; putMemory: (memory: Memory) => Promise<void> | void }>,
): void {
  describe(`GraphStore contract: ${name}`, () => {
    let store: GraphStore;
    let putMemory: (memory: Memory) => Promise<void> | void;

    beforeEach(async () => {
      ({ store, putMemory } = await createStore());
    });

    it("creates a relation and finds it via getRelated (outgoing)", async () => {
      const a = makeMemory({ id: "a" });
      const b = makeMemory({ id: "b" });
      await putMemory(a);
      await putMemory(b);

      await store.createRelation(makeRelation({ fromMemoryId: "a", toMemoryId: "b", type: "supports" }));

      const related = await store.getRelated("a", { direction: "outgoing" });
      expect(related.map((m) => m.id)).toEqual(["b"]);
    });

    it("finds relations via getRelated (incoming)", async () => {
      const a = makeMemory({ id: "a" });
      const b = makeMemory({ id: "b" });
      await putMemory(a);
      await putMemory(b);

      await store.createRelation(makeRelation({ fromMemoryId: "a", toMemoryId: "b", type: "supports" }));

      const related = await store.getRelated("b", { direction: "incoming" });
      expect(related.map((m) => m.id)).toEqual(["a"]);
    });

    it("filters getRelated by relation type", async () => {
      const a = makeMemory({ id: "a" });
      const b = makeMemory({ id: "b" });
      const c = makeMemory({ id: "c" });
      await putMemory(a);
      await putMemory(b);
      await putMemory(c);

      await store.createRelation(makeRelation({ fromMemoryId: "a", toMemoryId: "b", type: "supports" }));
      await store.createRelation(makeRelation({ fromMemoryId: "a", toMemoryId: "c", type: "contradicts" }));

      const supportsOnly = await store.getRelated("a", { direction: "outgoing", types: ["supports"] });
      expect(supportsOnly.map((m) => m.id)).toEqual(["b"]);
    });

    it("deleteRelation removes the relation", async () => {
      const a = makeMemory({ id: "a" });
      const b = makeMemory({ id: "b" });
      await putMemory(a);
      await putMemory(b);

      const relation = makeRelation({ fromMemoryId: "a", toMemoryId: "b" });
      await store.createRelation(relation);
      await store.deleteRelation(relation.id);

      const related = await store.getRelated("a", { direction: "outgoing" });
      expect(related).toHaveLength(0);
    });

    it("traverse follows relations up to maxDepth", async () => {
      const a = makeMemory({ id: "a" });
      const b = makeMemory({ id: "b" });
      const c = makeMemory({ id: "c" });
      await putMemory(a);
      await putMemory(b);
      await putMemory(c);

      await store.createRelation(makeRelation({ fromMemoryId: "a", toMemoryId: "b", type: "related_to" }));
      await store.createRelation(makeRelation({ fromMemoryId: "b", toMemoryId: "c", type: "related_to" }));

      const depthOne = await store.traverse("a", { direction: "outgoing", maxDepth: 1 });
      expect(depthOne.map((m) => m.id).sort()).toEqual(["b"]);

      const depthTwo = await store.traverse("a", { direction: "outgoing", maxDepth: 2 });
      expect(depthTwo.map((m) => m.id).sort()).toEqual(["b", "c"]);
    });

    it("getRelated returns nothing for a memory with no relations", async () => {
      const a = makeMemory({ id: "a" });
      await putMemory(a);
      const related = await store.getRelated("a");
      expect(related).toHaveLength(0);
    });
  });
}
