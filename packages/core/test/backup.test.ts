import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryStore, InMemoryVersionStore, InMemoryGraphStore, InMemoryConflictStore } from "@memorie/storage-memory";
import { createMemoryEngine, type MemoryEngine } from "../src/engine.js";

describe("MemoryEngine export()/import() (Phase 7)", () => {
  let engine: MemoryEngine;

  beforeEach(() => {
    engine = createMemoryEngine({
      memoryStore: new InMemoryStore(),
      versionStore: new InMemoryVersionStore(),
    });
  });

  it("export() returns every memory in scope", async () => {
    await engine.add({ namespace: "users", subjectId: "u1", type: "fact", content: "a" });
    await engine.add({ namespace: "users", subjectId: "u1", type: "fact", content: "b" });
    await engine.add({ namespace: "users", subjectId: "u2", type: "fact", content: "c" });

    const exported = await engine.export({ namespace: "users", subjectId: "u1" });
    expect(exported.version).toBe(1);
    expect(exported.memories).toHaveLength(2);
    expect(exported.exportedAt).toBeTruthy();
  });

  it("export({ includeVersions: true }) includes version history", async () => {
    const memory = await engine.add({ namespace: "users", subjectId: "u1", type: "fact", content: "v1" });
    await engine.update(memory.id, { content: "v2" });

    const exported = await engine.export({ namespace: "users", subjectId: "u1", includeVersions: true });
    expect(exported.versions?.filter((v) => v.memoryId === memory.id)).toHaveLength(2);
  });

  it("import() re-creates memories through the normal add() path (validated + versioned)", async () => {
    const source = createMemoryEngine({
      memoryStore: new InMemoryStore(),
      versionStore: new InMemoryVersionStore(),
    });
    await source.add({ namespace: "users", subjectId: "u1", type: "fact", content: "a" });
    await source.add({ namespace: "users", subjectId: "u1", type: "fact", content: "b" });
    const exported = await source.export({ namespace: "users", subjectId: "u1" });

    const result = await engine.import(exported);
    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(0);

    const imported = await engine.list({ namespace: "users", subjectId: "u1" });
    expect(imported.map((m) => m.content).sort()).toEqual(["a", "b"]);
    // Re-created with fresh ids/versions via add(), not raw-copied.
    expect(imported.every((m) => m.version === 1)).toBe(true);
  });

  it("import() with onConflict: 'skip' (default) leaves existing memories untouched", async () => {
    const memory = await engine.add({ namespace: "users", subjectId: "u1", type: "fact", content: "original" });
    const exported = await engine.export({ namespace: "users", subjectId: "u1" });
    // Mutate the exported copy to prove skip doesn't apply it.
    exported.memories[0]!.content = "tampered";

    const result = await engine.import(exported);
    expect(result.skipped).toBe(1);
    expect(result.imported).toBe(0);
    expect((await engine.get(memory.id))?.content).toBe("original");
  });

  it("import() with onConflict: 'overwrite' updates existing memories", async () => {
    const memory = await engine.add({ namespace: "users", subjectId: "u1", type: "fact", content: "original" });
    const exported = await engine.export({ namespace: "users", subjectId: "u1" });
    exported.memories[0]!.content = "updated via import";

    const result = await engine.import(exported, { onConflict: "overwrite" });
    expect(result.imported).toBe(1);
    expect((await engine.get(memory.id))?.content).toBe("updated via import");
  });

  it("round-trips relations when a GraphStore is configured on both sides", async () => {
    const store = new InMemoryStore();
    const graphStore = new InMemoryGraphStore((id) => store.get(id));
    const sourceEngine = createMemoryEngine({ memoryStore: store, graphStore });
    const a = await sourceEngine.add({ namespace: "users", subjectId: "u1", type: "fact", content: "a" });
    const b = await sourceEngine.add({ namespace: "users", subjectId: "u1", type: "fact", content: "b" });
    await sourceEngine.relate(a.id, b.id, "supports");

    const exported = await sourceEngine.export({ namespace: "users", subjectId: "u1", includeRelations: true });
    expect(exported.relations).toHaveLength(1);

    const destStore = new InMemoryStore();
    const destGraph = new InMemoryGraphStore((id) => destStore.get(id));
    const destEngine = createMemoryEngine({ memoryStore: destStore, graphStore: destGraph });
    const result = await destEngine.import(exported);
    expect(result.relationsImported).toBe(1);
  });

  it("round-trips conflicts when a ConflictStore is configured on both sides", async () => {
    const store = new InMemoryStore();
    const conflictStore = new InMemoryConflictStore();
    const sourceEngine = createMemoryEngine({ memoryStore: store, conflictStore });
    await conflictStore.record({
      id: "c1",
      memoryA: "m-a",
      memoryB: "m-b",
      type: "value-mismatch",
      confidence: 0.9,
      status: "open",
      createdAt: new Date(),
    });

    // export() only includes conflicts that reference an exported memory,
    // so this test checks the plumbing directly via a matching memory id.
    await store.create({
      id: "m-a",
      namespace: "users",
      subjectId: "u1",
      type: "fact",
      content: "a",
      state: "active",
      importance: 0.5,
      confidence: 0.5,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      accessCount: 0,
      version: 1,
    });

    const exported = await sourceEngine.export({ namespace: "users", subjectId: "u1", includeConflicts: true });
    expect(exported.conflicts).toHaveLength(1);

    const destConflictStore = new InMemoryConflictStore();
    const destEngine = createMemoryEngine({ memoryStore: new InMemoryStore(), conflictStore: destConflictStore });
    const result = await destEngine.import(exported);
    expect(result.conflictsImported).toBe(1);
    expect(await destConflictStore.get("c1")).not.toBeNull();
  });
});
