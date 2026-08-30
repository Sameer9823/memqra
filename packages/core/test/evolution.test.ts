import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryStore, InMemoryVersionStore, InMemoryConflictStore } from "@memorie/storage-memory";
import type { Memory, MemoryComparison, MemoryIntelligenceProvider } from "@memorie/types";
import { UnsupportedCapabilityError } from "@memorie/types";
import { createMemoryEngine, type MemoryEngine } from "../src/engine.js";

/** A stub MemoryIntelligenceProvider whose compare()/consolidate() behavior is scripted per test. */
function makeIntelligence(overrides: Partial<MemoryIntelligenceProvider> = {}): MemoryIntelligenceProvider {
  return {
    extract: async () => [],
    classify: async () => ({ type: "fact", confidence: 1 }),
    compare: async () => ({ relation: "unrelated", confidence: 0 }) as MemoryComparison,
    consolidate: async (memories: Memory[]) => ({
      ...memories[0]!,
      content: memories.map((m) => m.content).join(" "),
    }),
    ...overrides,
  };
}

function makeEngine(options?: { intelligence?: MemoryIntelligenceProvider }): {
  engine: MemoryEngine;
  conflictStore: InMemoryConflictStore;
} {
  const conflictStore = new InMemoryConflictStore();
  const engine = createMemoryEngine({
    memoryStore: new InMemoryStore(),
    versionStore: new InMemoryVersionStore(),
    conflictStore,
    evolution: options?.intelligence
      ? { intelligenceProvider: options.intelligence, resolutionStrategy: "latest" }
      : { resolutionStrategy: "latest" },
  });
  return { engine, conflictStore };
}

describe("MemoryEngine evolution pipeline (Phase 4)", () => {
  let engine: MemoryEngine;
  let conflictStore: InMemoryConflictStore;

  beforeEach(() => {
    ({ engine, conflictStore } = makeEngine());
  });

  it("scenario: creates a new memory when nothing resolvable matches", async () => {
    const result = await engine.ingest({
      namespace: "users",
      subjectId: "u1",
      type: "preference",
      content: "Prefers TypeScript.",
    });
    expect(result.outcome).toBe("created");
    expect(result.memory.content).toBe("Prefers TypeScript.");
  });

  it("scenario: evolves an existing memory when identity matches and no conflict is detected", async () => {
    await engine.ingest({
      namespace: "users",
      subjectId: "u1",
      type: "preference",
      content: "User prefers TypeScript.",
      metadata: { key: "preferred_language" },
    });

    const result = await engine.ingest({
      namespace: "users",
      subjectId: "u1",
      type: "preference",
      content: "User prefers TypeScript for application development.",
      metadata: { key: "preferred_language" },
    });

    expect(result.outcome).toBe("updated");
    expect(result.memory.content).toBe("User prefers TypeScript for application development.");
    expect(result.memory.version).toBe(2);
    expect(result.previous?.content).toBe("User prefers TypeScript.");
  });

  it("scenario 6: detects a duplicate and does not create a new memory", async () => {
    const first = await engine.ingest({
      namespace: "users",
      subjectId: "u1",
      type: "note",
      content: "Likes hiking on weekends.",
    });

    const second = await engine.ingest({
      namespace: "users",
      subjectId: "u1",
      type: "note",
      content: "  Likes hiking on weekends.  ",
    });

    expect(second.outcome).toBe("duplicate");
    expect(second.memory.id).toBe(first.memory.id);
    expect(second.skipped?.content).toBe("  Likes hiking on weekends.  ");

    const count = await engine.count({ namespace: "users", subjectId: "u1" });
    expect(count).toBe(1);
  });

  it("scenario: without a MemoryIntelligenceProvider, a matched identity with different content is treated as an update, not a conflict", async () => {
    await engine.ingest({
      namespace: "users",
      subjectId: "u1",
      type: "preference",
      content: "preferred_language = TypeScript",
      metadata: { key: "preferred_language" },
    });

    const result = await engine.ingest({
      namespace: "users",
      subjectId: "u1",
      type: "preference",
      content: "preferred_language = Python",
      metadata: { key: "preferred_language" },
    });

    expect(result.outcome).toBe("updated");
  });

  it("scenario 4: raises a conflict when a configured MemoryIntelligenceProvider reports a contradiction", async () => {
    const intelligence = makeIntelligence({
      compare: async () => ({ relation: "contradicts", confidence: 0.9, explanation: "conflicting values" }),
    });
    ({ engine, conflictStore } = makeEngine({ intelligence }));

    const first = await engine.ingest({
      namespace: "users",
      subjectId: "u1",
      type: "preference",
      content: "preferred_language = TypeScript",
      metadata: { key: "preferred_language" },
    });

    const result = await engine.ingest({
      namespace: "users",
      subjectId: "u1",
      type: "preference",
      content: "preferred_language = Python",
      metadata: { key: "preferred_language" },
    });

    expect(result.outcome).toBe("conflict");
    expect(result.conflict).toBeDefined();
    expect(result.conflict?.status).toBe("open");
    expect(result.conflict?.memoryA).toBe(first.memory.id);
    expect(result.conflict?.memoryB).toBe(result.memory.id);

    const openConflicts = await conflictStore.list({ status: "open" });
    expect(openConflicts.length).toBe(1);
  });

  it("scenario 5: resolves a conflict with an explicit strategy, superseding the loser", async () => {
    const intelligence = makeIntelligence({
      compare: async () => ({ relation: "contradicts", confidence: 0.9 }),
    });
    ({ engine, conflictStore } = makeEngine({ intelligence }));

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
    const conflictId = second.conflict!.id;

    const resolution = await engine.resolveConflict(conflictId, "highest-confidence");
    expect(resolution.strategy).toBe("highest-confidence");
    expect(resolution.winner.id).toBe(second.memory.id);
    expect(resolution.loser?.id).toBe(first.memory.id);
    expect(resolution.loser?.state).toBe("superseded");
    expect(resolution.winner.supersedes).toBe(first.memory.id);

    const resolved = await conflictStore.get(conflictId);
    expect(resolved?.status).toBe("resolved");
    expect(resolved?.resolvedMemoryId).toBe(second.memory.id);

    const loserRecord = await engine.get(first.memory.id);
    expect(loserRecord?.state).toBe("superseded");
    expect(loserRecord?.supersededBy).toBe(second.memory.id);
  });

  it("scenario 7: merges via the 'merge' resolution strategy using a MemoryIntelligenceProvider", async () => {
    const intelligence = makeIntelligence({
      compare: async () => ({ relation: "contradicts", confidence: 0.9 }),
    });
    ({ engine, conflictStore } = makeEngine({ intelligence }));

    const first = await engine.ingest({
      namespace: "users",
      subjectId: "u1",
      type: "preference",
      content: "Uses TypeScript.",
      metadata: { key: "preferred_language" },
    });
    const second = await engine.ingest({
      namespace: "users",
      subjectId: "u1",
      type: "preference",
      content: "Prefers TypeScript for application development.",
      metadata: { key: "preferred_language" },
    });
    const conflictId = second.conflict!.id;

    const resolution = await engine.resolveConflict(conflictId, "merge");
    expect(resolution.strategy).toBe("merge");
    expect(resolution.winner.content).toContain("Uses TypeScript.");
    expect(resolution.winner.mergedFrom).toEqual([first.memory.id, second.memory.id]);

    const loserA = await engine.get(first.memory.id);
    const loserB = await engine.get(second.memory.id);
    expect(loserA?.state).toBe("merged");
    expect(loserB?.state).toBe("merged");
  });

  it("consolidate() folds several memories using the MemoryIntelligenceProvider", async () => {
    const intelligence = makeIntelligence();
    ({ engine } = makeEngine({ intelligence }));

    const a = await engine.add({ namespace: "users", subjectId: "u1", type: "fact", content: "Uses TypeScript." });
    const b = await engine.add({
      namespace: "users",
      subjectId: "u1",
      type: "fact",
      content: "Builds applications with TypeScript.",
    });

    const merged = await engine.consolidate([a.id, b.id]);
    expect(merged.content).toContain("Uses TypeScript.");
    expect(merged.content).toContain("Builds applications with TypeScript.");
    expect(merged.mergedFrom).toEqual([a.id, b.id]);

    const recordA = await engine.get(a.id);
    const recordB = await engine.get(b.id);
    expect(recordA?.state).toBe("merged");
    expect(recordB?.state).toBe("merged");
  });

  it("consolidate() without a MemoryIntelligenceProvider throws UnsupportedCapabilityError", async () => {
    const plainEngine = createMemoryEngine({
      memoryStore: new InMemoryStore(),
      versionStore: new InMemoryVersionStore(),
    });
    const a = await plainEngine.add({ namespace: "users", subjectId: "u1", type: "fact", content: "a" });
    const b = await plainEngine.add({ namespace: "users", subjectId: "u1", type: "fact", content: "b" });

    await expect(plainEngine.consolidate([a.id, b.id])).rejects.toThrow(UnsupportedCapabilityError);
  });

  it("resolveConflict() without a ConflictStore throws UnsupportedCapabilityError", async () => {
    const plainEngine = createMemoryEngine({
      memoryStore: new InMemoryStore(),
      versionStore: new InMemoryVersionStore(),
    });
    await expect(plainEngine.resolveConflict("nope")).rejects.toThrow(UnsupportedCapabilityError);
  });

  it("ingest() raising a conflict without a ConflictStore configured throws UnsupportedCapabilityError", async () => {
    const intelligence = makeIntelligence({
      compare: async () => ({ relation: "contradicts", confidence: 0.9 }),
    });
    const plainEngine = createMemoryEngine({
      memoryStore: new InMemoryStore(),
      versionStore: new InMemoryVersionStore(),
      evolution: { intelligenceProvider: intelligence },
    });
    await plainEngine.ingest({
      namespace: "users",
      subjectId: "u1",
      type: "preference",
      content: "preferred_language = TypeScript",
      metadata: { key: "preferred_language" },
    });
    await expect(
      plainEngine.ingest({
        namespace: "users",
        subjectId: "u1",
        type: "preference",
        content: "preferred_language = Python",
        metadata: { key: "preferred_language" },
      }),
    ).rejects.toThrow(UnsupportedCapabilityError);
  });

  it("capabilities() reports conflictResolution based on whether a ConflictStore is configured", async () => {
    const { engine: withStore } = makeEngine();
    expect(withStore.capabilities().conflictResolution).toBe(true);

    const withoutStore = createMemoryEngine({ memoryStore: new InMemoryStore() });
    expect(withoutStore.capabilities().conflictResolution).toBe(false);
  });
});
