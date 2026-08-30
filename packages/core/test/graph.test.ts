import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryStore, InMemoryVersionStore, InMemoryGraphStore } from "@memorie/storage-memory";
import { UnsupportedCapabilityError, MemoryNotFoundError } from "@memorie/types";
import { createMemoryEngine, type MemoryEngine } from "../src/engine.js";

function makeEngine(): { engine: MemoryEngine; store: InMemoryStore } {
  const store = new InMemoryStore();
  const graphStore = new InMemoryGraphStore((id) => store.get(id));
  const engine = createMemoryEngine({
    memoryStore: store,
    versionStore: new InMemoryVersionStore(),
    graphStore,
  });
  return { engine, store };
}

describe("MemoryEngine graph relationships (Phase 5)", () => {
  let engine: MemoryEngine;

  beforeEach(() => {
    ({ engine } = makeEngine());
  });

  it("relate() creates a relation and related() finds it", async () => {
    const a = await engine.add({ namespace: "users", subjectId: "u1", type: "fact", content: "TypeScript is typed." });
    const b = await engine.add({ namespace: "users", subjectId: "u1", type: "fact", content: "Typed languages catch bugs earlier." });

    const relation = await engine.relate(a.id, b.id, "supports");
    expect(relation.fromMemoryId).toBe(a.id);
    expect(relation.toMemoryId).toBe(b.id);

    const related = await engine.related(a.id, { direction: "outgoing" });
    expect(related.map((m) => m.id)).toEqual([b.id]);
  });

  it("relate() throws MemoryNotFoundError for an unknown memory id", async () => {
    const a = await engine.add({ namespace: "users", subjectId: "u1", type: "fact", content: "a" });
    await expect(engine.relate(a.id, "does-not-exist", "related_to")).rejects.toThrow(MemoryNotFoundError);
  });

  it("unrelate() removes a relation", async () => {
    const a = await engine.add({ namespace: "users", subjectId: "u1", type: "fact", content: "a" });
    const b = await engine.add({ namespace: "users", subjectId: "u1", type: "fact", content: "b" });
    const relation = await engine.relate(a.id, b.id, "related_to");

    await engine.unrelate(relation.id);
    const related = await engine.related(a.id, { direction: "outgoing" });
    expect(related).toHaveLength(0);
  });

  it("traverse() follows multi-hop relations", async () => {
    const a = await engine.add({ namespace: "users", subjectId: "u1", type: "fact", content: "a" });
    const b = await engine.add({ namespace: "users", subjectId: "u1", type: "fact", content: "b" });
    const c = await engine.add({ namespace: "users", subjectId: "u1", type: "fact", content: "c" });

    await engine.relate(a.id, b.id, "derived_from");
    await engine.relate(b.id, c.id, "derived_from");

    const result = await engine.traverse(a.id, { direction: "outgoing", maxDepth: 2 });
    expect(result.map((m) => m.id).sort()).toEqual([b.id, c.id].sort());
  });

  it("related()/relate()/unrelate()/traverse() throw UnsupportedCapabilityError without a GraphStore", async () => {
    const plainEngine = createMemoryEngine({ memoryStore: new InMemoryStore() });
    const a = await plainEngine.add({ namespace: "users", subjectId: "u1", type: "fact", content: "a" });
    const b = await plainEngine.add({ namespace: "users", subjectId: "u1", type: "fact", content: "b" });

    await expect(plainEngine.related(a.id)).rejects.toThrow(UnsupportedCapabilityError);
    await expect(plainEngine.relate(a.id, b.id, "related_to")).rejects.toThrow(UnsupportedCapabilityError);
    await expect(plainEngine.unrelate("whatever")).rejects.toThrow(UnsupportedCapabilityError);
    await expect(plainEngine.traverse(a.id)).rejects.toThrow(UnsupportedCapabilityError);
  });

  it("search() contributes a 'relationship' signal when query.relatedTo is set", async () => {
    const seed = await engine.add({ namespace: "users", subjectId: "u1", type: "fact", content: "Seed memory." });
    const related = await engine.add({ namespace: "users", subjectId: "u1", type: "fact", content: "Unrelated wording entirely." });
    const unrelated = await engine.add({ namespace: "users", subjectId: "u1", type: "fact", content: "Also unrelated wording." });
    await engine.relate(seed.id, related.id, "related_to");

    const results = await engine.search({ namespace: "users", subjectId: "u1", relatedTo: seed.id });
    const relatedResult = results.find((r) => r.memory.id === related.id);
    const unrelatedResult = results.find((r) => r.memory.id === unrelated.id);

    expect(relatedResult?.matchedSignals).toContain("graph");
    expect(relatedResult!.score).toBeGreaterThan(unrelatedResult!.score);
  });

  it("capabilities() reports graph based on whether a GraphStore is configured", () => {
    expect(engine.capabilities().graph).toBe(true);
    const plainEngine = createMemoryEngine({ memoryStore: new InMemoryStore() });
    expect(plainEngine.capabilities().graph).toBe(false);
  });
});

describe("MemoryEngine evolution + graph integration", () => {
  it("ingest() records a 'contradicts' relation when a conflict is raised and a GraphStore is configured", async () => {
    const store = new InMemoryStore();
    const graphStore = new InMemoryGraphStore((id) => store.get(id));
    const { InMemoryConflictStore } = await import("@memorie/storage-memory");
    const conflictStore = new InMemoryConflictStore();
    const engine = createMemoryEngine({
      memoryStore: store,
      versionStore: new InMemoryVersionStore(),
      graphStore,
      conflictStore,
      evolution: {
        intelligenceProvider: {
          extract: async () => [],
          classify: async () => ({ type: "fact", confidence: 1 }),
          compare: async () => ({ relation: "contradicts", confidence: 0.9 }),
          consolidate: async (memories) => ({
            ...memories[0]!,
            content: memories.map((m) => m.content).join(" "),
          }),
        },
      },
    });

    const first = await engine.ingest({
      namespace: "users",
      subjectId: "u1",
      type: "preference",
      content: "preferred_language = TypeScript",
      metadata: { key: "preferred_language" },
    });
    const second = await engine.ingest({
      namespace: "users",
      subjectId: "u1",
      type: "preference",
      content: "preferred_language = Python",
      metadata: { key: "preferred_language" },
    });

    const related = await engine.related(first.memory.id, { direction: "outgoing", types: ["contradicts"] });
    expect(related.map((m) => m.id)).toEqual([second.memory.id]);
  });
});
