import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryStore, InMemoryVersionStore } from "@memorie/storage-memory";
import { VersionConflictError, InvalidStateTransitionError, ValidationError, UnsupportedCapabilityError } from "@memorie/types";
import { createMemoryEngine, type MemoryEngine } from "../src/engine.js";

function makeEngine(): MemoryEngine {
  return createMemoryEngine({
    memoryStore: new InMemoryStore(),
    versionStore: new InMemoryVersionStore(),
  });
}

describe("MemoryEngine", () => {
  let engine: MemoryEngine;

  beforeEach(() => {
    engine = makeEngine();
  });

  it("creates a memory with sane defaults", async () => {
    const memory = await engine.add({
      namespace: "users",
      subjectId: "u1",
      type: "preference",
      content: "Prefers TypeScript",
    });
    expect(memory.id).toBeTruthy();
    expect(memory.state).toBe("active");
    expect(memory.version).toBe(1);
    expect(memory.importance).toBe(0.5);
    expect(memory.confidence).toBe(0.5);
  });

  it("rejects invalid input", async () => {
    await expect(
      engine.add({ namespace: "", subjectId: "u1", type: "fact", content: "x" }),
    ).rejects.toThrow(ValidationError);

    await expect(
      engine.add({
        namespace: "n",
        subjectId: "u1",
        type: "fact",
        content: "x",
        importance: 2,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("evolves a memory across versions while preserving history (spec section 3 example)", async () => {
    const m1 = await engine.add({
      namespace: "users",
      subjectId: "u1",
      type: "preference",
      content: "User prefers TypeScript.",
    });

    const m2 = await engine.evolve(m1.id, {
      content: "User prefers TypeScript for application development.",
    });
    expect(m2.version).toBe(2);
    expect(m2.state).toBe("updated");

    const m3 = await engine.evolve(m1.id, {
      content: "User prefers TypeScript for application development and Python for data science.",
    });
    expect(m3.version).toBe(3);

    const history = await engine.history(m1.id);
    expect(history.map((v) => v.version)).toEqual([1, 2, 3]);
    expect(history[0]?.snapshot.content).toBe("User prefers TypeScript.");
    expect(history[2]?.snapshot.content).toBe(m3.content);
  });

  it("supports time-travel queries via getAt", async () => {
    const clockValues = [
      new Date("2026-01-01T00:00:00Z"),
      new Date("2026-01-02T00:00:00Z"),
      new Date("2026-01-03T00:00:00Z"),
    ];
    let i = 0;
    const timedEngine = createMemoryEngine({
      memoryStore: new InMemoryStore(),
      versionStore: new InMemoryVersionStore(),
      clock: () => clockValues[Math.min(i++, clockValues.length - 1)] as Date,
    });

    const created = await timedEngine.add({
      namespace: "ns",
      subjectId: "s1",
      type: "fact",
      content: "v1",
    });
    await timedEngine.evolve(created.id, { content: "v2" });

    const atCreation = await timedEngine.getAt(created.id, new Date("2026-01-01T12:00:00Z"));
    expect(atCreation?.content).toBe("v1");

    const afterUpdate = await timedEngine.getAt(created.id, new Date("2026-01-02T12:00:00Z"));
    expect(afterUpdate?.content).toBe("v2");

    const before = await timedEngine.getAt(created.id, new Date("2025-01-01T00:00:00Z"));
    expect(before).toBeNull();
  });

  it("throws VersionConflictError on stale optimistic-concurrency update", async () => {
    const memory = await engine.add({
      namespace: "ns",
      subjectId: "s1",
      type: "fact",
      content: "v1",
    });

    await engine.evolve(memory.id, { content: "v2" }, { expectedVersion: memory.version });

    await expect(
      engine.evolve(memory.id, { content: "v3" }, { expectedVersion: memory.version }),
    ).rejects.toThrow(VersionConflictError);
  });

  it("enforces the lifecycle state machine", async () => {
    const memory = await engine.add({
      namespace: "ns",
      subjectId: "s1",
      type: "fact",
      content: "v1",
    });
    const deleted = await engine.update(memory.id, { state: "deleted" });
    expect(deleted.state).toBe("deleted");

    await expect(engine.update(memory.id, { state: "active" })).rejects.toThrow(
      InvalidStateTransitionError,
    );
  });

  it("falls back to structured + keyword search with no SearchStore configured", async () => {
    await engine.add({ namespace: "ns", subjectId: "s1", type: "fact", content: "loves TypeScript" });
    await engine.add({ namespace: "ns", subjectId: "s1", type: "fact", content: "enjoys Python" });

    const results = await engine.search({ namespace: "ns", subjectId: "s1", query: "typescript" });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.memory.content).toContain("TypeScript");
  });

  it("isolates tenants during list/search", async () => {
    await engine.add({ tenantId: "a", namespace: "ns", subjectId: "s1", type: "fact", content: "secret-a" });
    await engine.add({ tenantId: "b", namespace: "ns", subjectId: "s1", type: "fact", content: "secret-b" });

    const resultsA = await engine.list({ tenantId: "a", namespace: "ns", subjectId: "s1" });
    expect(resultsA.every((m) => m.tenantId === "a")).toBe(true);
    expect(resultsA.some((m) => m.content === "secret-b")).toBe(false);
  });

  it("forgets memories matching a scope", async () => {
    await engine.add({ namespace: "forget-ns", subjectId: "s1", type: "fact", content: "a" });
    await engine.add({ namespace: "forget-ns", subjectId: "s1", type: "fact", content: "b" });
    await engine.add({ namespace: "keep-ns", subjectId: "s1", type: "fact", content: "c" });

    const count = await engine.forget({ namespace: "forget-ns", subjectId: "s1" });
    expect(count).toBe(2);
    expect(await engine.count({ namespace: "forget-ns", subjectId: "s1" })).toBe(0);
    expect(await engine.count({ namespace: "keep-ns", subjectId: "s1" })).toBe(1);
  });

  it("throws UnsupportedCapabilityError for related() with no GraphStore", async () => {
    const memory = await engine.add({ namespace: "ns", subjectId: "s1", type: "fact", content: "a" });
    await expect(engine.related(memory.id)).rejects.toThrow(UnsupportedCapabilityError);
  });

  it("reports capabilities accurately", () => {
    const caps = engine.capabilities();
    expect(caps.memory).toBe(true);
    expect(caps.versioning).toBe(true);
    expect(caps.graph).toBe(false);
    expect(caps.vector).toBe(false);
  });

  it("reports versioning: false when no VersionStore is configured", () => {
    const bareEngine = createMemoryEngine({ memoryStore: new InMemoryStore() });
    expect(bareEngine.capabilities().versioning).toBe(false);
  });

  it("tracks access via recall()", async () => {
    const memory = await engine.add({ namespace: "ns", subjectId: "s1", type: "fact", content: "a" });
    expect(memory.accessCount).toBe(0);
    const recalled = await engine.recall(memory.id);
    expect(recalled?.accessCount).toBe(1);
    expect(recalled?.lastAccessedAt).toBeInstanceOf(Date);
  });
});
